/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Meta from 'gi://Meta';
import Gdk from 'gi://Gdk';
import Mtk from 'gi://Mtk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Cogl from 'gi://Cogl';
import Atspi from 'gi://Atspi';
//import { PixelProcessor } from "./pixelProcessor.mjs"
//import Cairo from 'gi://Cairo';
// import St from 'gi://St';
// import Shell from 'gi://Shell';
// import Gio from 'gi://Gio';

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

function print(str) {
    debug?.(str);
} false

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
function findTabDetails(node, haveWindow, pageTabListBounds, pad) {
    const np = pad + "  ";
    if (!haveWindow) {
        print(`${pad}looking for window`);
        // Try to find the window first
        let ret = null;
        for (let i = 0; i < node.get_child_count(); i++) {
            const child = node.get_child_at_index(i);
            if (child !== null && child.get_state_set().contains(Atspi.StateType.ACTIVE)) {
                print(`${pad}found window`);
                ret = findTabDetails(child, true, null, np);
                break;
            }
        }
        return ret;
    }
    if (pageTabListBounds === null) {
        print(`${pad}Looking for page tab list`);
        let ret = null;
        for (let i = 0; i < node.get_child_count(); i++) {
            const child = node.get_child_at_index(i);
            if (child !== null) {
                // print(`${pad}found PTL`);
                if (child.get_role() === Atspi.Role.PAGE_TAB_LIST) {
                    const pos = child.get_position(Atspi.CoordType.WINDOW);
                    const size = child.get_size();
                    pageTabListBounds = [pos.x, pos.x + size.x];
                    debug?.(`Got bounds: ${pageTabListBounds}; ${size.y}`);
                }
                ret = findTabDetails(child, true, pageTabListBounds, np);
                if (ret !== null) {
                    if (ret.pageTabList === null) {
                        ret.pageTabList = child.get_selection_iface();
                        debug?.(`SEL: ${ret.pageTabList.get_n_selected_children()}, ${ret.pageTabList}`);
                        for (let j = 0; j < child.get_child_count(); j++) {
                            debug?.(`  ${j} / ${child.get_child_count()}: ${ret.pageTabList.is_child_selected(j)}`);
                        }
                    }
                    break;
                }
            }
        }
        return ret;
    }
    // Find the tabs
    print(`${pad}looking for tabs`);
    let ret = null;
    /**
     * @type {[number, number, number, number][]}
     */
    let tabs = [];
    const tabObjs = [];
    let selectedIdx = -1;
    for (let i = 0; i < node.get_child_count(); i++) {
        const child = node.get_child_at_index(i);
        if (child === null) {
            continue;
        }
        if (child.get_role() !== Atspi.Role.PAGE_TAB) {
            if (child.get_role() === Atspi.Role.PAGE_TAB_LIST) {
                debug?.(`${pad}Found ANOTHER page tab list`);
            }
            ret = findTabDetails(child, true, pageTabListBounds, np);
            if (ret !== null) {
                break;
            }
        } else {
            // Have a tab!
            const p = pos(child);
            /**
             * @type{[number, number, number, number]}
             */
            const numPos = [p[0], p[1], p[2], p[3]];
            tabs.push(numPos);
            if (p[4] === "*") {
                selectedIdx = i;
            }
            tabObjs.push(child);
        }
    }
    if (tabs.length > 1 && tabs[0][0] === tabs[1][0]) {
        // Vertical tabs, skip
        return ret;
    }
    if (tabs.length === 0)
        return ret;
    return {
        tabs: tabs,
        tabObjs: tabObjs,
        selectedIdx: selectedIdx,
        pageTabList: null,
        tabBounds: pageTabListBounds
    };
}

/**
 * 
 * @param {Atspi.Accessible} pageTabList the Page Tab List
 * @param {Atspi.Accessible[]} tabs The tabs
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
    //desktop.clear_cache();
    const nchild = desktop.get_child_count();
    for (let i = 0; i < nchild; i++) {
        const app = desktop.get_child_at_index(i);
        //app.clear_cache();
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

class TabSwitchGesture {
    constructor() {
        //const seat = Clutter.get_default_backend().get_default_seat();
        //this._virtualPointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        //this._pixelProcessor = new PixelProcessor();
        this.actor = null;
        this.cursor = null;
        this.cursorPt = [0, 0];
        this.tabs = null;
        this.tabObjs = null;
        this.tabBounds = [0, 0];
        this.selectedIdx = -1;
        this.pageTabList = null;
        Atspi.init();
    }

    /**
     * 
     * @param {boolean} movingRight 
     */
    begin(movingRight) {
        debug?.("Begin");
        const tabs = findTabs();
        let rect = [0, 0, 100, 100];
        if (!tabs) {
            debug?.(`Unable to find tabs`);
            return;
        } else {
            debug?.(`Found tabs: ${tabs.tabs}; ${tabs.selectedIdx}; ${tabs.tabBounds}`);
            if (tabs.tabs.length > 0) {
                rect = tabs.tabs[tabs.selectedIdx];
            }
        }
        if (tabs.selectedIdx < 0 || tabs.selectedIdx >= tabs.tabs.length) {
            debug?.("No active tab found!");
            return;
        }

        // Find start cursor location
        this.tabs = tabs.tabs;
        this.tabObjs = tabs.tabObjs;
        this.selectedIdx = tabs.selectedIdx;
        debug?.(`selected index: ${this.selectedIdx}`);
        this.pageTabList = tabs.pageTabList;
        const tab = tabs.tabs[tabs.selectedIdx];
        debug?.(`Tabs: ${tabs.tabs}; ${tab}`);
        const HOLDBACK = 3;  // Points to hold back from the edge
        this.cursorPt = [
            movingRight ? tab[0] + tab[2] - HOLDBACK : tab[0] + HOLDBACK,
            tab[1] + tab[3]
        ];

        const colorDark = new Cogl.Color({ red: 100, green: 125, blue: 100, alpha: 128 });
        this.actor = new MyActor({
            background_color: colorDark,
            x: rect[0], y: rect[1],
            width: rect[2], height: rect[3]
        });
        const actors = global.get_window_actors();
        const focused_window = global.display.get_focus_window();
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
        debug?.(`Update with ${dx}`);
        this.cursor.x += dx;
        debug?.(`X: ${this.cursor.x}, TABS: ${this.tabs}`);
        for (let i = 0; i < this.tabs.length; i++) {
            const tab = this.tabs[i];
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
        debug?.("end");

        // Check active tab
        debug?.(`X: ${this.cursor.x}, TABS: ${this.tabs}`);
        this.pageTabList.select_child(this.selectedIdx);
        const action = this.tabObjs[this.selectedIdx].get_action_iface();
        if (action) {
            action.do_action(0);
        }
        // for (let i = 0; i < this.tabs.length; i++) {
        //     const tab = this.tabs[i];
        //     if (this.cursor.x >= tab[0] && this.cursor.x <= (tab[0] + tab[2])) {
        //         // Update tab
        //         // if (this.pageTabList.is_child_selected(i)) {
        //         //     break;
        //         // }
        //         debug?.(`MOVED TO TAB: ${i}`);
        //         this.pageTabList.select_child(i);
        //         const action = this.tabObjs[i].get_action_iface();
        //         if (action) {
        //             action.do_action(0);
        //         }
        //         break;
        //     }
        // }

        debug?.(`Done moving to new tab`);
        this.actor.get_parent().remove_child(this.actor);
        this.actor = null;
        this.cursor.get_parent().remove_child(this.cursor);
        this.cursor = null;
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