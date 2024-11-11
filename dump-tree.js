/*
 * Usage:
 *    gjs dump-tree <application-name>
 *
 * Dump the accessibility hiearchy tree for a given application.
 */

/*
  Notes for adlr: check dumped graph for "page tab list"
  common command line:
  sleep 1 && gjs dump-tree.js "org.gnome.Terminal"   | less
  (switch right away to the window you want)

  */

const Atspi = imports.gi.Atspi;

function get_states(ss) {
    const ret = [];
    if (ss.contains(Atspi.StateType.ACTIVE)) {
        ret.push("ACTIVE");
    }
    if (ss.contains(Atspi.StateType.ANIMATED)) {
        ret.push("ANIMATED");
    }
    if (ss.contains(Atspi.StateType.ARMED)) {
        ret.push("ARMED");
    }
    if (ss.contains(Atspi.StateType.BUSY)) {
        ret.push("BUSY");
    }
    if (ss.contains(Atspi.StateType.CHECKED)) {
        ret.push("CHECKED");
    }
    if (ss.contains(Atspi.StateType.COLLAPSED)) {
        ret.push("COLLAPSED");
    }
    if (ss.contains(Atspi.StateType.DEFUNCT)) {
        ret.push("DEFUNCT");
    }
    if (ss.contains(Atspi.StateType.EDITABLE)) {
        ret.push("EDITABLE");
    }
    if (ss.contains(Atspi.StateType.ENABLED)) {
        ret.push("ENABLED");
    }
    if (ss.contains(Atspi.StateType.EXPANDABLE)) {
        ret.push("EXPANDABLE");
    }
    if (ss.contains(Atspi.StateType.EXPANDED)) {
        ret.push("EXPANDED");
    }
    if (ss.contains(Atspi.StateType.FOCUSABLE)) {
        ret.push("FOCUSABLE");
    }
    if (ss.contains(Atspi.StateType.FOCUSED)) {
        ret.push("FOCUSED");
    }
    if (ss.contains(Atspi.StateType.HAS_TOOLTIP)) {
        ret.push("HAS_TOOLTIP");
    }
    if (ss.contains(Atspi.StateType.HORIZONTAL)) {
        ret.push("HORIZONTAL");
    }
    if (ss.contains(Atspi.StateType.ICONIFIED)) {
        ret.push("ICONIFIED");
    }
    if (ss.contains(Atspi.StateType.INDETERMINATE)) {
        ret.push("INDETERMINATE");
    }
    if (ss.contains(Atspi.StateType.INVALID)) {
        ret.push("INVALID");
    }
    if (ss.contains(Atspi.StateType.INVALID_ENTRY)) {
        ret.push("INVALID_ENTRY");
    }
    if (ss.contains(Atspi.StateType.IS_DEFAULT)) {
        ret.push("IS_DEFAULT");
    }
    if (ss.contains(Atspi.StateType.LAST_DEFINED)) {
        ret.push("LAST_DEFINED");
    }
    if (ss.contains(Atspi.StateType.MANAGES_DESCENDANTS)) {
        ret.push("MANAGES_DESCENDANTS");
    }
    if (ss.contains(Atspi.StateType.MODAL)) {
        ret.push("MODAL");
    }
    if (ss.contains(Atspi.StateType.MULTISELECTABLE)) {
        ret.push("MULTISELECTABLE");
    }
    if (ss.contains(Atspi.StateType.MULTI_LINE)) {
        ret.push("MULTI_LINE");
    }
    if (ss.contains(Atspi.StateType.OPAQUE)) {
        ret.push("OPAQUE");
    }
    if (ss.contains(Atspi.StateType.PRESSED)) {
        ret.push("PRESSED");
    }
    if (ss.contains(Atspi.StateType.REQUIRED)) {
        ret.push("REQUIRED");
    }
    if (ss.contains(Atspi.StateType.RESIZABLE)) {
        ret.push("RESIZABLE");
    }
    if (ss.contains(Atspi.StateType.SELECTABLE)) {
        ret.push("SELECTABLE");
    }
    if (ss.contains(Atspi.StateType.SELECTABLE_TEXT)) {
        ret.push("SELECTABLE_TEXT");
    }
    if (ss.contains(Atspi.StateType.SELECTED)) {
        ret.push("SELECTED");
    }
    if (ss.contains(Atspi.StateType.SENSITIVE)) {
        ret.push("SENSITIVE");
    }
    if (ss.contains(Atspi.StateType.SHOWING)) {
        ret.push("SHOWING");
    }
    if (ss.contains(Atspi.StateType.SINGLE_LINE)) {
        ret.push("SINGLE_LINE");
    }
    if (ss.contains(Atspi.StateType.STALE)) {
        ret.push("STALE");
    }
    if (ss.contains(Atspi.StateType.SUPPORTS_AUTOCOMPLETION)) {
        ret.push("SUPPORTS_AUTOCOMPLETION");
    }
    if (ss.contains(Atspi.StateType.TRANSIENT)) {
        ret.push("TRANSIENT");
    }
    if (ss.contains(Atspi.StateType.TRUNCATED)) {
        ret.push("TRUNCATED");
    }
    if (ss.contains(Atspi.StateType.VERTICAL)) {
        ret.push("VERTICAL");
    }
    if (ss.contains(Atspi.StateType.VISIBLE)) {
        ret.push("VISIBLE");
    }
    if (ss.contains(Atspi.StateType.VISITED)) {
        ret.push("VISITED");
    }
    return ret.join(",");
}

function getLabel(accessible) {
    let relationSet;
    let i = 0;

    relationSet = accessible.get_relation_set();
    if (!relationSet)
        return "NULL";

    /* something like "let relation in relationSet" doesn't work, and
     * it seems that GArray "len" is not exposed */
    while (relationSet[i]) {
        let relation = relationSet[i];

        if (relation.get_relation_type() == Atspi.RelationType.LABELLED_BY)
            return relation.get_target(0).get_name();

        i++;
    }

    return "NULL";
}

function printInfo(accessible, appName) {
    let name;
    let roleName = "NULL";
    let stateSetString = "NULL";

    name = accessible.get_name();
    if (!name)
        name = getLabel(accessible);
    roleName = accessible.get_role_name();

    const pos = accessible.get_position(Atspi.CoordType.WINDOW);
    const size = accessible.get_size();
    const pt = `(${pos.x}, ${pos.y}, ${size.x}, ${size.y})`;
    return "("+name+", "+roleName+", "+pt+")";
}

function dumpNodeContent(node, padding, path) {
    let newPadding = padding + "  ";

    nodeInfo = printInfo(node);
    print(padding + nodeInfo + ` P: ${path}${node.get_state_set().contains(Atspi.StateType.SELECTED) ? "SELECTED" : ""}`);

    for (let i = 0; i < node.get_child_count(); i++) {
        const newPath = [...path, i];
        dumpNodeContent(node.get_child_at_index(i), newPadding, newPath);
    }
}

// returns [x, y, width, height]
function pos(acc) {
    const pos = acc.get_position(Atspi.CoordType.WINDOW);
    const size = acc.get_size();
    const states = acc.get_state_set();
    const selected = states.contains(Atspi.StateType.SELECTED);
    return [pos.x, pos.y, size.x, size.y, selected ? "*" : ""  /*, get_states(states)*/]
}

function descend(root, path) {
    let out = root;
    while (path.length != 0) {
        // print(`Path: ${path}, out: ${out}`);
        print(`Descend at ${pos(out)}, ${out.get_role()}`);
        out = out.get_child_at_index(path.shift());
    }
    // print(`out: ${out}`);
    return out;
}

function dumpWindows(app) {
    for (let i = 0; i < app.get_child_count(); i++) {
        print(`window ${i}, ${pos(app.get_child_at_index(i))}`);
    }
}

function chromeTabStrip(acc) {
    strip = descend(acc, [0,0,0,5,0,0,1,0]);
    for (let i = 0; i < strip.get_child_count(); i++) {
        tab = strip.get_child_at_index(i);
        print(pos(tab));
    }
}

function dumpApplication(appName) {
    let desktop;
    let found = false;

    Atspi.init();

    desktop = Atspi.get_desktop (0);
    for(let i =0; i < desktop.get_child_count(); i++) {
        let app = desktop.get_child_at_index(i);
        print(app.get_name());
        //dumpWindows(app);
        if (app.get_name() == appName) {
            found = true;
            dumpNodeContent(app, "  ", []);
            //chromeTabStrip(app);
        }
    }

    if (!found) {
        print ("ERROR: Application "+appName+" not found");
    }
}

if (ARGV.length == 1) {
    let appName = ARGV[0];

    dumpApplication(appName);
} else {
    print("ERROR: We only dump the content of a specific app, specify the name");
}

