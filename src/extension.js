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
import { PixelProcessor } from "./pixelProcessor.mjs"
//import Cairo from 'gi://Cairo';
// import St from 'gi://St';
// import Shell from 'gi://Shell';
// import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const Mode = {
    NONE: 0,
    PENDING: 1,
    VALID: 2,
    INVALID: 3
};

const NUM_FINGERS = 3;

function log(msg) { }  // @girs
/**
 * @type {Shell.Global}
 */
let global;  // @girs


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
        //log("_touchpadEvent = " + event.type());

        // Process swipe
        if (event.type() == Clutter.EventType.TOUCHPAD_SWIPE) {
            log(`Swipe event`);
            let ret = this._swipeHandler(actor, event);
            switch (ret) {
                case Clutter.EVENT_PROPAGATE:
                    log("-> prop -> stop");
                    ret = Clutter.EVENT_STOP;
                    break;
                case Clutter.EVENT_STOP:
                    log("-> stop");
                    break;
                default:
                    log(`-> ${ret}`);
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
        log(`Movement: ${event.get_gesture_motion_delta()}, phase ${phase}`);
        if (phase === Clutter.TouchpadGesturePhase.BEGIN) {
            if (Main.actionMode != Shell.ActionMode.NORMAL)
                return Clutter.EVENT_PROPAGATE;
            const pp = new PixelProcessor();
            log(`PP says ${pp.getVal()}`);
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

class TabSwitchGesture {
    constructor() {
        const seat = Clutter.get_default_backend().get_default_seat();
        this._virtualPointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        this._pixelProcessor = new PixelProcessor();
    }

    /**
     * 
     * @param {boolean} movingRight 
     */
    begin(movingRight) {
        //log('gesture begin: ' + dx_in + ', ' + dy_in);
        /**
         * @type {Meta.WindowActor[]}
         */
        const actors = global.get_window_actors();
        const focused_window = global.display.get_focus_window();
        const focused_actors = actors.filter(windowactor => windowactor.meta_window === focused_window);
        if (focused_actors.length !== 1) {
            log('Wrong number of focused windows for tab switch gesture: ' + focused_actors.length);
            return;
        }

        const framerect = focused_window.get_frame_rect();  // The window part, not including shadow
        log(`Frame size: ${framerect.x}, ${framerect.y}, ${framerect.width}, ${framerect.height}`);

        const wa = focused_actors[0];  // Includes full surface with shadows
        log('wa: ' + wa.x + ', ' + wa.y + ', ' + wa.width + ', ' + wa.height);
        log(`scale: ${wa.scale_x}, ${wa.scale_x}, ${wa.get_resource_scale()}`);
        const rect = Mtk.Rectangle.new(
        //new Cairo.RectangleInt({  // What we'll get a screenshot of
            /*x:*/ framerect.x - wa.x,
            /*y:*/ framerect.y - wa.y,
            /*width:*/ framerect.width * wa.get_resource_scale(),
            /*height:*/ Math.min(framerect.height, 101) * wa.get_resource_scale());
        //});
        //log('rect: ' + rect.x + ', ' + rect.y + ', ' + rect.width + ', ' + rect.height);
        const surface = wa.get_image(/*rect*/ null);  // Does this leak?

        if (surface === null) {
            log('no surface!');
            return;
        }
        log(`Got image: ${rect.x}, ${rect.y}, ${rect.width}, ${rect.height}`);
        const pixbuf = Gdk.pixbuf_get_from_surface(surface, 0, 0, rect.width, rect.height);
        //cairo_surface_destroy(surface);
        if (pixbuf === null) {
            log('no pixbuf!');
            return;
        }
        // got the pixbuf!
        if (pixbuf.get_colorspace() !== GdkPixbuf.Colorspace.RGB || pixbuf.get_bits_per_sample() !== 8 || pixbuf.get_n_channels() !== 4) {
            log('Unable to handle pixbuf with colorspace:' + pixbuf.get_colorspace() + ', bps:' + pixbuf.get_bits_per_sample() + ', hasAlpha:' +
                pixbuf.get_has_alpha() + ', channels:' + pixbuf.get_n_channels());
            return;
        }
        // log('colorspace:' + pixbuf.get_colorspace() + ', bps:' + pixbuf.get_bits_per_sample() + ', hasAlpha:' +
        // 	pixbuf.get_has_alpha() + ', channels:' + pixbuf.get_n_channels());
        // const bytes = pixbuf.get_pixels();
        // const bwvals = [];
        // for (let i = 0; i < rect.width; i++) {
        // 	const boff = i*4;
        // 	bwvals.push((bytes[boff] + bytes[boff + 1] + bytes[boff + 2]) / (255 * 3));
        // }

        const file = Gio.File.new_for_path('/tmp/data.png');
        if (file.query_exists(null)) {
            file.delete(null);
        }
        const outstream = file.create(Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        pixbuf.save_to_streamv(outstream, 'png', null, null, null);
        log('Wrote /tmp/data.png');

        const posBounds = this._pixelProcessor.process(pixbuf,
            focused_window.wmClass, focused_window.maximizedHorizontally,
            focused_window.maximizedVertically, movingRight);



        // Get mouse position
        const [mouse_x, mouse_y, _] = global.get_pointer();
        // log('mouse is at ' + mouse_x + ', ' + mouse_y);
        this._originalCursorPos = [mouse_x, mouse_y];
        //const seat = Clutter.get_default_backend().get_default_seat();
        //seat.warp_pointer(framerect.x + getStartPosition(pixbuf, kMagicRow, focused_window), framerect.y + kMagicRow);
        const new_x = framerect.x + posBounds.x;
        const new_y = framerect.y + posBounds.y;
        // log('warping cursor to ' + new_x + ', ' + new_y);
        this._virtualPointer.notify_absolute_motion(Clutter.CURRENT_TIME, new_x, new_y);
        this._bounds = [framerect.x + posBounds.minX, framerect.x + posBounds.maxX];
        this._lastNewX = new_x;

    }
    /**
     * 
     * @param {number} dx 
     */
    update(dx) {
        if (!this.hasOwnProperty('_bounds')) {
            log(`Update called with ${dx} but missing _bounds`);
            return;
        }
        log(`Update with ${dx}`);
        const [_mouse_x, mouse_y, _] = global.get_pointer();
        //log('mouse is at ' + mouse_x + ', ' + mouse_y);
        this._lastNewX = Math.max(this._bounds[0], Math.min(this._bounds[1], this._lastNewX + dx));
        this._virtualPointer.notify_absolute_motion(Clutter.CURRENT_TIME, Math.round(this._lastNewX), mouse_y);

    }
    /**
     * 
     * @param {boolean} isCancel 
     */
    end(isCancel) {
        if (!isCancel) {
            this._virtualPointer.notify_button(Clutter.CURRENT_TIME, Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            this._virtualPointer.notify_button(Clutter.CURRENT_TIME, Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        }
        this._virtualPointer.notify_absolute_motion(Clutter.CURRENT_TIME, this._originalCursorPos[0], this._originalCursorPos[1]);
        this._originalCursorPos = null;
        this._bounds = null;
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