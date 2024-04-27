import GdkPixbuf from 'gi://GdkPixbuf';
function log(msg) { console.log(msg); }   // @girs

export class TabSwitchBounds {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.minX = 0;
        this.maxX = 0;
    }
    arr() {
        return [this.x, this.y, this.minX, this.maxX];
    }
}

export class PixelProcessor {
    constructor() {
        this.abc = "Mabc";
    }
    getVal() {
        return this.abc;
    }
    /**
     * Process a pix buf
     * @param {GdkPixbuf.Pixbuf} pixbuf 
     * @param {String} wmclass
     * @param {boolean} maxH
     * @param {boolean} maxH
     * @param {boolean} movingRight
     * @returns {TabSwitchBounds}
     */
    process(pixbuf, wmclass, maxH, maxV, movingRight) {
        const row = this.getMagicRow(wmclass, maxH, maxV);
        const bounds = this.getBounds(wmclass, maxH, maxV, pixbuf)
        const ret = new TabSwitchBounds();
        ret.minX = bounds[0];
        ret.maxX = bounds[1];
        ret.y = row;
        ret.x = this.getStartPosition(pixbuf, row, movingRight);
        return ret;
    }

    getMagicRow(wmclass, maxH, maxV) {
        const offsets = {
            'google-chrome': [8, 8],  // maximized, non-maximized offset from top
            'firefox': [7, 7],
            'gnome-terminal-server': [52, 52],
        };
        const index = maxH && maxV ? 0 : 1;
        const wmclassLower = wmclass.toLowerCase();
        const keys = Object.keys(offsets);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (wmclassLower.startsWith(key)) {
                return offsets[key][index];
            }
        }
        return 100;  // default when not found
    }

    /** LocatePlusInChromium Window
     * @param {GdkPixbuf.Pixbuf} pixbuf
     * @param {boolean} maximized
     * @returns {number | null}
     */
    locateRightChromium(pixbuf, maximized) {
        const bytes = pixbuf.get_pixels();

        // returns value in range: 0 -> black, 1 -> white
        const getPixel = (x, y) => {
            if (x >= pixbuf.width || y >= pixbuf.height || x < 0 || y < 0) {
                log('Invalid request of getPixel. Out of bounds!');
                return 0;
            }
            const start = pixbuf.get_rowstride() * y + 4 * x;
            const ret = (bytes[start] + bytes[start + 1] + bytes[start + 2]) / (3 * 255);
            return ret;
        };

        const pixelValuesNear = (val_a, val_b) => {
            const kMaxDarkColorDelta = 0.2;
            return Math.abs(val_a - val_b) < kMaxDarkColorDelta;
        };
        const getLeftCenterRight = (x_init, y_init) => {
            let x_min = x_init;
            let x_max = x_init;
            const value = getPixel(x_init, y_init);
            while (x_min > 0) {
                if (!pixelValuesNear(getPixel(x_min - 1, y_init), value))
                    break;
                x_min--;
            }
            while (x_max < (pixbuf.width - 1)) {
                if (!pixelValuesNear(getPixel(x_max + 1, y_init), value))
                    break;
                x_max++;
            }
            return [x_min, ((x_min + x_max) / 2) | 0, x_max];
        };
        const getTopMidBottom = (x_init, y_init) => {
            let y_min = y_init;
            let y_max = y_init;
            const value = getPixel(x_init, y_init);
            while (y_min > 0) {
                if (!pixelValuesNear(getPixel(x_init, y_min - 1), value))
                    break;
                y_min--;
            }
            while (y_max < (pixbuf.height - 1)) {
                if (!pixelValuesNear(getPixel(x_init, y_max + 1), value))
                    break;
                y_max++;
            }
            return [y_min, ((y_min + y_max) / 2) | 0, y_max];
        };
        // This function does a lot, but hopefully it bails out early 99% of the time
        const isPlus = (x, y) => {
            const kMinWidth = 8;
            const kMaxWidth = 30;
            const kMinLineWidth = 2;
            const s1 = getLeftCenterRight(x, y);
            const s1_width = s1[2] - s1[0] + 1;
            if (s1_width < kMinLineWidth || s1_width > kMaxWidth)
                return false;
            const s2 = getTopMidBottom(s1[1], y);
            const s2_height = s2[2] - s2[0] + 1;
            if (s2_height < kMinWidth || s2_height > kMaxWidth)
                return false;
            const s3 = getLeftCenterRight(s1[1], s2[1]);
            const s3_width = s3[2] - s3[0] + 1;
            if (s3_width < kMinWidth || s3_width > kMaxWidth)
                return false;
            // Make sure roughly square
            if (Math.abs(s2_height - s3_width) > 3) {
                return false;
            }
            // Now, check line thickness at extremes
            // [x, y, scan_horiz]
            const start_coords = [
                [s1[1], s2[0], true],
                [s1[1], s2[2], true],
                [s3[0], s2[1], false],
                [s3[2], s2[1], false],
            ];
            const sizes = start_coords.map(coords => {
                const res = coords[2] ? getLeftCenterRight(coords[0], coords[1]) : getTopMidBottom(coords[0], coords[1]);
                return res[2] - res[0] + 1;
            });
            const min_thickness = Math.min(...sizes);
            const max_thickness = Math.max(...sizes);
            if (max_thickness - min_thickness > 2) {
                return false;
            }
            // Ensure line thickness is not too small or big
            if (min_thickness < kMinLineWidth || max_thickness * 3 > s3_width) {
                return false;
            }
            return true;
        };
        // Find the + on the right of the tabstrip. Start at the right and keep trying.
        const kSearchRow = maximized ? 16 : 23;
        const kMinSize = 20;
        if (pixbuf.width < kMinSize) {
            log('pixbuf too narrow');
            return null;
        }
        const background = getPixel(pixbuf.width - 2, kSearchRow);
        log(`BG: ${background} from ${pixbuf.width - 2}, ${kSearchRow}`);
        // First, look for a plus that's not the background color
        let x;
        for (x = pixbuf.width - 3; x > kMinSize; x--) {
            const value = getPixel(x, kSearchRow);
            if (value === background)
                continue;
            if (isPlus(x, kSearchRow))
                break;
        }
        if (x === kMinSize) {
            log('could not find a plus');
            return null;
        }
        // Search for background color again
        for (; x > kMinSize; x--) {
            const value = getPixel(x, kSearchRow);
            log(`${x}: ${value}, ${background}`)
            if (value !== background)
                continue;
            break;
        }
        if (x === kMinSize) {
            log('could not find bg color after plus');
            return null;
        }
        // Now, find the first pixel that's not background color
        for (; x > kMinSize; x--) {
            const value = getPixel(x, kSearchRow);
            if (value === background)
                continue;
            break;
        }
        if (x === kMinSize) {
            log('could not find non-bg color after plus');
            return null;
        }
        return x - 5;
    }

    /**
     * Get bounds for movement from a window
     * @param {String} wmclass 
     * @param {boolean} maxH
     * @param {boolean} maxV
     * @param {GdkPixbuf.Pixbuf} pixbuf 
     * @returns {[number, number]}
     */
    getBounds(wmclass, maxH, maxV, pixbuf) {
        const width = pixbuf.get_width();
        /**
         * @type {[number, number]}
         */
        const ret = [0, 0 + width - 1];
        if (wmclass.toLowerCase().startsWith('google-chrome')) {
            const maximized = maxH && maxV;
            // if (!maximized)
            // 	ret[0] = 0 + 8;
            ret[0] = 40;
            const right = this.locateRightChromium(pixbuf, maximized);
            if (right !== null)
                ret[1] = right;
        }
        return ret;
    }

    getStartPosition(pixbuf, row, movingRight) {
        // const candidateToStr = (candidate): string => {
        // 	return 'val: ' + candidate[0] + ', [' + candidate[1] + ', ' + candidate[2] + ']';
        // };
        // Pixels to exclude on left/right of an app
        // const exclude = {
        // 	'google-chrome': [0, 100],
        // };
        // Idea: get center of contiguous block of pixels, at least of size 5, that's closest to 0 or 1
        // Assume third pixel from left is background color. look for brightest that's not background
        const pixels = pixbuf.get_pixels().slice(
            pixbuf.get_rowstride() * row,
            pixbuf.get_rowstride() * row + 4 * pixbuf.width,
        ).reduce((out, val, idx) => {
            switch (idx % 4) {
                case 0: out.push(val); break;
                case 1: out[out.length - 1] += val; break;
                case 2: out[out.length - 1] += val;
                    out[out.length - 1] /= (3 * 255); break;
                case 3: // alpha, skip.
                    break;
            }
            return out;
        }, []);
        if (pixels.length < 3) {
            return 0;
        }
        const bg = pixels[2];
        //log('bg: ' + bg);
        const group = pixels.reduce((accum, current, index) => {
            if (accum.length === 0 || accum[accum.length - 1][0] !== current) {
                accum.push([current, index, index]);
            } else {
                accum[accum.length - 1][2] = index;
            }
            return accum;
        }, []).filter(elt => {
            return Math.abs(elt[0] - bg) > 0.01 && (elt[2] - elt[1] > 4);
        }).reduce((prev, current) => {
            // log('prev: ' + candidateToStr(prev));
            // log('curr: ' + candidateToStr(current));
            if (prev[0] > current[0])
                return prev;
            return current;
        });

        const size = group[2] - group[1] + 1;
        let ret = ((group[1] + group[2]) / 2) | 0;
        if (size > 10) {
            ret = movingRight ? group[2] - 1 : group[1] + 1;
        }

        //log('Move cursor to offset ' + ret + ' max: ' + window.maximizedHorizontally);
        return ret;
    };


}
