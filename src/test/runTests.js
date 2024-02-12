import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';

function log(msg) { }   // @girs
const ARGV = [];  // @girs

import { PixelProcessor } from "../pixelProcessor.mjs"

function readFile(path) {
    let pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
    log(`Got pixbuf: ${pixbuf.get_width()} x ${pixbuf.get_height()}`);
    const pp = new PixelProcessor();
    const details = pp.process(pixbuf, 'google-chrome', false, false, true);
    log(`Results: ${details.arr()}`);
}

function main() {
    if (ARGV.length <= 0) {
        log("Missing args");
        return;
    }
    readFile(ARGV[0]);
}

main();
