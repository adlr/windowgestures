/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0
 */

import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
// import GdkPixbuf from 'gi://GdkPixbuf';
import Meta from 'gi://Meta';
// import Gdk from 'gi://Gdk';
// import Mtk from 'gi://Mtk';
// import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Cogl from 'gi://Cogl';
import Atspi from 'gi://Atspi';

function log(msg) { }  // @girs
/**
 * @type {Shell.Global}
 */
let global;  // @girs

const DEBUG = false;
let debug = undefined;
if (DEBUG) {
    debug = s => log(s);
}

const MyActor = GObject.registerClass(
    class MyActor extends Clutter.Actor {
        // _init(x) {
        //     super._init(x);
        // }
        vfunc_paint(ctx) {
            debug?.("Paint!");
            debug?.(ctx);
        }
    }
);

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const Mode = {
    NONE: 0,
    PENDING: 1,
    VALID: 2,
    INVALID: 3
};

const NUM_FINGERS = 3;

// From https://github.com/icedman/swap-finger-gestures-3-4/blob/main/extension.js
class BuiltinGesturesUseFourFingers {
    constructor() { }

    enable() {
        this._swipeMods = [
            //Main.overview._swipeTracker._touchpadGesture,
            // @ts-ignore
            Main.wm._workspaceAnimation._swipeTracker._touchpadGesture,
            // Main.overview._overview._controls._workspacesDisplay._swipeTracker
            //     ._touchpadGesture,
            // Main.overview._overview._controls._appDisplay._swipeTracker._touchpadGesture
        ];

        this._swipeMods.forEach((g) => {
            g._newHandleEvent = (actor, event) => {
                event._get_touchpad_gesture_finger_count =
                    event.get_touchpad_gesture_finger_count;
                event.get_touchpad_gesture_finger_count = () => {
                    return event._get_touchpad_gesture_finger_count() == 4 ? 3 : 0;
                };
                return g._handleEvent(actor, event);
            };

            global.stage.disconnectObject(g);
            global.stage.connectObject(
                'captured-event::touchpad',
                g._newHandleEvent.bind(g),
                g
            );
        });
    }

    disable() {
        this._swipeMods.forEach((g) => {
            global.stage.disconnectObject(g);
            global.stage.connectObject(
                'captured-event::touchpad',
                g._handleEvent.bind(g),
                g
            );
        });
        this._swipeMods = [];
    }
}


// Manager Class
class Manager {

    // Init Extension
    constructor(ext) {
        // Init variables - keep enable() clean
        this._x = 0;  // Movement in X direction
        this._y = 0;  // Movement in Y direction
        this._mode = Mode.NONE;
        this._clearVars();
        this._gestureHandler = new TabSwitchGesture();

        // Capture Touchpad Event
        this._gestureCallbackID = global.stage.connect(
            'captured-event::touchpad',
            this._touchpadEvent.bind(this)
        );
    }

    // Cleanup Extension
    destroy() {
        // Release Touchpad Event Capture
        global.stage.disconnect(this._gestureCallbackID);

        // Cleanup all variables
        this._clearVars();
    }

    // Initialize variables
    _clearVars() {
        this._x = 0;  // Movement in X direction
        this._y = 0;  // Movement in Y direction
        this._mode = Mode.NONE;
    }

    // Is On Overview
    _isOnOverview() {
        return Main.overview._shown;
    }

    /**
     * Touch Event Handler
     * @param {undefined | Clutter.Actor} actor 
     * @param {Clutter.Event} event 
     * @returns {boolean}
     */
    _touchpadEvent(actor, event) {
        //debug?.("_touchpadEvent = " + event.type());

        // Process swipe
        if (event.type() == Clutter.EventType.TOUCHPAD_SWIPE) {
            debug?.(`Swipe event`);
            let ret = this._swipeHandler(actor, event);
            switch (ret) {
                case Clutter.EVENT_PROPAGATE:
                    debug?.("-> prop -> stop");
                    ret = Clutter.EVENT_STOP;
                    break;
                case Clutter.EVENT_STOP:
                    debug?.("-> stop");
                    break;
                default:
                    debug?.(`-> ${ret}`);
                    break;
            }
            return ret;
        }


        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Swipe event handler
     * @param {undefined | Clutter.Actor} actor 
     * @param {Clutter.Event} event 
     * @returns {boolean}
     */
    _swipeHandler(actor, event) {
        if (event.get_touchpad_gesture_finger_count() !== NUM_FINGERS) {
            return Clutter.EVENT_PROPAGATE;
        }

        const phase = event.get_gesture_phase();
        debug?.(`Movement: ${event.get_gesture_motion_delta()}, phase ${phase}`);
        if (phase === Clutter.TouchpadGesturePhase.BEGIN) {
            if (Main.actionMode != Shell.ActionMode.NORMAL)
                return Clutter.EVENT_PROPAGATE;
            // const pp = new PixelProcessor();
            // debug?.(`PP says ${pp.getVal()}`);
            this._mode = Mode.PENDING;
            this._x = 0;
            this._y = 0;
            return Clutter.EVENT_PROPAGATE;
        }

        if (this._mode === Mode.PENDING) {
            const DIST_THRESH = 1;
            if (phase !== Clutter.TouchpadGesturePhase.UPDATE) {
                return Clutter.EVENT_PROPAGATE;
            }
            const [dx, dy] = event.get_gesture_motion_delta();
            this._x += dx;
            this._y += dy;
            const absX = Math.abs(this._x);
            const absY = Math.abs(this._y);
            if (Math.max(absX, absY) > DIST_THRESH) {
                // We're doing a gesture of some kind
                if (absX < absY) {
                    // Vertical, so doing a gesture we don't handle
                    this._mode = Mode.INVALID;
                    return Clutter.EVENT_PROPAGATE;
                }
                // Horizontal, we handle it
                this._mode = Mode.VALID;
                this._gestureHandler.begin(this._x > 0);
                return Clutter.EVENT_STOP;
            }
        }

        if (this._mode === Mode.VALID) {
            if (phase === Clutter.TouchpadGesturePhase.UPDATE) {
                const [dx, dy] = event.get_gesture_motion_delta();
                this._gestureHandler.update(dx);
                return Clutter.EVENT_STOP;
            }
            // Must be ending
            this._gestureHandler.end(phase === Clutter.TouchpadGesturePhase.CANCEL);
            this._mode = Mode.NONE;
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

}

/**
 * Returns size (x, y, w, h) + string ("*" is selected) for the tab
 * @param {Atspi.Accessible} acc The Accessible item to get bounds of
 * @returns {[number, number, number, number, string]}
 */
function pos(acc) {
    const pos = acc.get_position(Atspi.CoordType.WINDOW);
    const size = acc.get_size();
    const states = acc.get_state_set();
    const selected = states.contains(Atspi.StateType.SELECTED);
    return [pos.x, pos.y, size.x, size.y, selected ? "*" : ""  /*, get_states(states)*/]
}

/**
 * 
 * @param {Atspi.Accessible} pageTabList the Page Tab List
 * @param {Atspi.Accessible[]} tabObjs The tabs
 * @returns {null | {
 *   tabs: [number, number, number, number][],
 *   tabObjs: Atspi.Accessible[],
 *   selectedIdx: number,
 *   tabBounds: [number, number],
 *   pageTabList: Atspi.Selection
 * }}
 */
function formatFoundTabs(pageTabList, tabObjs) {
    /**
     * @type{[number, number, number, number][]}
     */
    const tabs = [];
    let selectedIdx = -1;
    for (let i = 0; i < tabObjs.length; i++) {
        const r = pos(tabObjs[i]);
        if (r[4] === "*")
            selectedIdx = i;
        /**
         * @type{[number, number, number, number]}
         */
        const tab = [r[0], r[1], r[2], r[3]];
        debug?.(`pushing ${tab}`);
        tabs.push(tab);
    }
    const ptlPos = pageTabList.get_position(Atspi.CoordType.WINDOW);
    return {
        tabs: tabs,
        tabObjs: tabObjs,
        selectedIdx: selectedIdx,
        tabBounds: [ptlPos.x, ptlPos.x + pageTabList.get_size().x],
        pageTabList: pageTabList
    };
}

const PAGE_TAB_LIST_MATCH_RULE = Atspi.MatchRule.new(Atspi.StateSet.new([]), Atspi.CollectionMatchType.ALL,
    {}, Atspi.CollectionMatchType.ANY,
    [Atspi.Role.PAGE_TAB_LIST], Atspi.CollectionMatchType.ANY,
    [], Atspi.CollectionMatchType.ALL,
    false
);
const TAB_MATCH_RULE = Atspi.MatchRule.new(Atspi.StateSet.new([]), Atspi.CollectionMatchType.ALL,
    {}, Atspi.CollectionMatchType.ANY,
    [Atspi.Role.PAGE_TAB], Atspi.CollectionMatchType.ANY,
    [], Atspi.CollectionMatchType.ALL,
    false
);

/**
 * 
 * @param {Atspi.Accessible} node Root node to search
 * @param {boolean} haveWindow Window was found (set to false when starting)
 * @param {null | [number, number]} pageTabListBounds Bounds of page tab list
 * @param {string} pad Padding for debug prints
 * @returns {null | {
*   tabs: [number, number, number, number][],
*   tabObjs: Atspi.Accessible[],
*   selectedIdx: number,
*   tabBounds: [number, number],
*   pageTabList: Atspi.Selection
* }}
*/
function findTabDetails2(node, haveWindow, pageTabListBounds, pad) {
    // Find window
    let child = null;
    for (let i = 0; i < node.get_child_count(); i++) {
        const test_child = node.get_child_at_index(i);
        if (test_child !== null && test_child.get_state_set().contains(Atspi.StateType.ACTIVE)) {
            child = test_child;
            break;
        }
    }
    if (child === null) {
        debug?.(`No active windows found for app`);
        return null;
    }

    const dummy = child.get_attributes();
    const ptls = child.get_collection_iface().get_matches(PAGE_TAB_LIST_MATCH_RULE, Atspi.CollectionSortOrder.CANONICAL,
        0, true
    );
    debug?.(`Got ${ptls.length} possible PTLs`);
    for (let i = 0; i < ptls.length; i++) {
        const ptl = ptls[i];
        const tabs = ptl.get_collection_iface().get_matches(TAB_MATCH_RULE, Atspi.CollectionSortOrder.CANONICAL,
            0, true
        );
        debug?.(`Got tabs: ${tabs}`);
        if (tabs && tabs.length > 0) {
            if ((i + 1) < ptls.length && tabs.length > 1 &&
                tabs[0].get_position(Atspi.CoordType.WINDOW).x === tabs[1].get_position(Atspi.CoordType.WINDOW).x) {
                continue;
            }
            // Got our answer
            return formatFoundTabs(ptl, tabs);
        }
    }
    debug?.(`returning nothing!`);
    return null;
}

function findTabs() {
    const desktop = Atspi.get_desktop(0);
    const nchild = desktop.get_child_count();
    for (let i = 0; i < nchild; i++) {
        const app = desktop.get_child_at_index(i);
        const start = new Date().getTime();
        const tabs = findTabDetails2(app, false, null, "--");
        const end = new Date().getTime();
        if (tabs) {
            debug?.(`TIME TO FIND TABS: ${end - start}`);
            return tabs;
        }
    }
    return null;
}

/**
 * 
 * @param {*} tabs 
 * @param {Meta.Window} window 
 */
function adjustTabs(tabs, window) {
    // If Code on high-DPI display, scale down
    const disp = window.get_display();
    const mon = window.get_monitor();
    const scale = disp.get_monitor_scale(mon);
    debug?.(`Scale: ${scale}`);
    if (scale > 1 && window.wm_class === "Code") {

    }
}

/**
 * Interface for tab controller. Can give geometric bounds and switch active tab.
 * 
 * @typedef {object} TabController
 * @property {function(): Array<number>} getBounds - Retrieves the bounds of the entire tab area.
 * @property {function(): number} numTabs - Gets the number of tabs.
 * @property {function(number): Array<number>} getTabRect - Gets the bounds of a particular tab. An array containing: x, y, width, height of the tab.
 * @property {function(): number} getSelectedTab - Gets the selected tab index.
 * @property {function(number): void} activateTab - Activates the tab at the specified index.
 */

/** @implements {TabController} */
class AtspiTabController {
    constructor() {
        this.tabs = findTabs();
        if (this.tabs === null) {
            throw new Error("Unable to find tabs");
        }
        if (this.tabs.selectedIdx < 0 || this.tabs.selectedIdx >= this.tabs.tabs.length) {
            throw new Error("No active tab found!");
        }
    }
    getBounds() {
        return this.tabs.tabBounds;
    }
    numTabs() {
        return this.tabs.tabs.length;
    }
    getTabRect(index) {
        return this.tabs.tabs[index];
    }
    getSelectedTab() {
        return this.tabs.selectedIdx;
    }
    activateTab(index) {
        this.tabs.pageTabList.select_child(index);
        const action = this.tabs.tabObjs[index].get_action_iface();
        if (action) {
            action.do_action(0);
        }
    }
}

/** @implements {TabController} */
class HackAdjustmentsTabController {
    /**
     * 
     * @param {TabController} other 
     * @param {Meta.Window} window
     */
    constructor(other, window) {
        this.tabController = other;
        this.adjX = (x) => x;
        this.adjY = (y) => y;
        this.adjW = (w) => w;
        this.adjH = (h) => h;
        // If Code on high-DPI display, scale down
        const disp = window.get_display();
        const mon = window.get_monitor();
        const scale = disp.get_monitor_scale(mon);
        debug?.(`Scale: ${scale}`);
        if (scale > 1 && window.wm_class === "Code") {
            // Divide by 2
            const win_x = window.get_frame_rect().x;
            const win_y = window.get_frame_rect().y;
            this.adjX = (x) => (x - win_x) / 2;
            this.adjY = (y) => (y - win_y) / 2;
            this.adjW = (w) => w / 2;
            this.adjH = (h) => h / 2;
        } else if (window.wm_class === "org.mozilla.firefox") {
            const br = window.get_buffer_rect();
            const brx = br.x;
            const bry = br.y;
            const fr = window.get_frame_rect();
            const frx = fr.x;
            const fry = fr.y;
            // Increase X and Y by 25;
            this.adjX = (x) => x + (frx - brx);
            this.adjY = (y) => y + (fry - bry);
            debug?.(`Adjusting windows by ${frx - brx}, ${fry - bry}`);
        }
    }
    getBounds() {
        const ret = this.tabController.getBounds();
        return [
            this.adjX(ret[0]),
            this.adjX(ret[1])
        ];
    }
    numTabs() {
        return this.tabController.numTabs();
    }
    getTabRect(index) {
        const ret = this.tabController.getTabRect(index);
        return [
            this.adjX(ret[0]),
            this.adjY(ret[1]),
            this.adjW(ret[2]),
            this.adjH(ret[3])
        ];
    }
    getSelectedTab() {
        return this.tabController.getSelectedTab();
    }
    activateTab(index) {
        this.tabController.activateTab(index);
    }
}

class TabSwitchGesture {
    constructor() {
        this.actor = null;
        this.cursor = null;
        this.cursorPt = [0, 0];
        this.tabController = null;
        Atspi.init();
    }

    /**
     * 
     * @param {boolean} movingRight 
     */
    begin(movingRight) {
        debug?.("Begin");
        this.tabController = new AtspiTabController();

        /** @type Meta.Window */
        const focused_window = global.display.get_focus_window();
        this.tabController = new HackAdjustmentsTabController(this.tabController, focused_window);
        // adjustTabs(tabs, focused_window);

        // Find start cursor location
        this.selectedIdx = this.tabController.getSelectedTab();
        debug?.(`selected index: ${this.selectedIdx}`);
        const tab = this.tabController.getTabRect(this.selectedIdx);
        const HOLDBACK = 3;  // Points to hold back from the edge
        this.cursorPt = [
            movingRight ? tab[0] + tab[2] - HOLDBACK : tab[0] + HOLDBACK,
            tab[1] + tab[3]
        ];

        const colorDark = new Cogl.Color({ red: 100, green: 125, blue: 100, alpha: 128 });
        this.actor = new MyActor({
            background_color: colorDark,
            x: tab[0], y: tab[1],
            width: tab[2], height: tab[3]
        });
        const actors = global.get_window_actors();
        debug?.(`WM class: ${focused_window.wm_class}`);
        const focused_actors = actors.filter(windowactor => windowactor.meta_window === focused_window);
        if (focused_actors.length !== 1) {
            debug?.('Wrong number of focused windows for tab switch gesture: ' + focused_actors.length);
            return;
        }
        const wa = focused_actors[0];  // Includes full surface with shadows
        wa.add_child(this.actor);

        const lightColor = new Cogl.Color({ red: 200, green: 125, blue: 150, alpha: 128 });
        this.cursor = new MyActor({
            background_color: lightColor,
            x: this.cursorPt[0], y: this.cursorPt[1],
            width: 10, height: 20
        });
        wa.add_child(this.cursor);
    }
    /**
     * 
     * @param {number} dx 
     */
    update(dx) {
        if (this.tabController === null)
            return;
        debug?.(`Update with ${dx}`);
        this.cursor.x += dx;
        debug?.(`X: ${this.cursor.x}`);
        for (let i = 0; i < this.tabController.numTabs(); i++) {
            const tab = this.tabController.getTabRect(i);
            if (this.cursor.x >= tab[0] && this.cursor.x <= (tab[0] + tab[2])) {
                // Update tab
                if (i === this.selectedIdx) {
                    break;
                }
                debug?.(`MOVED TO TAB: ${i}`);
                this.selectedIdx = i;
                this.actor.x = tab[0];
                this.actor.y = tab[1];
                this.actor.width = tab[2];
                this.actor.height = tab[3];
                break;
            }
        }
    }
    /**
     * 
     * @param {boolean} isCancel 
     */
    end(isCancel) {
        if (this.tabController === null)
            return;
        debug?.("end");

        // Check active tab
        debug?.(`X: ${this.cursor.x}`);
        this.tabController.activateTab(this.selectedIdx);

        debug?.(`Done moving to new tab`);
        this.actor.get_parent().remove_child(this.actor);
        this.actor = null;
        this.cursor.get_parent().remove_child(this.cursor);
        this.cursor = null;
        this.tabController = null;
    }
}

// Export Extension
export default class TabSwitchExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._moveGestures = new BuiltinGesturesUseFourFingers();
    }
    // Enable Extension
    enable() {
        this._moveGestures.enable();
        this.manager = new Manager(this);
    }

    // Disable Extension
    disable() {
        this.manager?.destroy();
        this.manager = null;
        this._moveGestures.disable();
    }
}