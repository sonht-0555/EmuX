/* Water Sort Puzzle */

const color_list = [
    "#AB5130", "#4C6885", "#F0B541", "#63AB3F", "#FF7AAE",
    "#2F5753", "#692464", "#E64539", "#C8D45D", "#4FA4B8",
    "#DFE0E8", "#A3A7C2", "#686F99", "#404973", "#3D2936",
    "#52333F", "#8F4D57", "#BD6A62", "#92E8C0", "#CC2F7B",
];

const ui_color_list = [
    "#2C354D",
];

var undo_history = [];
var message_timeout;
var is_pouring = false;

function set_pointer_action(element, handler) {
    element.onpointerdown = function (event) {
        event.preventDefault();
        event.stopPropagation();
        handler.call(this, event);
    };
}

function select_bottle() {
    if (is_pouring) return;
    let selected = document.getElementsByClassName("selected-bottle");

    if (selected.length) {
        let source = selected[0];
        deselect(source);

        if (source != this && source.lastChild) {
            pour(source, this);
        }
    }
    else {
        select(this);
    }
}

function select(bottle) {
    bottle.classList.add("selected-bottle");
}

function deselect(bottle) {
    bottle.classList.remove("selected-bottle");
}

function pour(source, target) {
    let color = source.lastChild.style.backgroundColor;
    let bottle_space = get_bottle_space(target);

    if (bottle_space <= 0) {
        display("Bottle full");
    }
    else if (target.lastChild && color != target.lastChild.style.backgroundColor) {
        display("Cannot mix");
    }
    else {
        display("");
        is_pouring = true;
        let amount = Math.min(bottle_space, get_height(source.lastChild));
        remove_water(source, amount, true);
        add_water(target, color, amount, true);
        cap_full_with_single_color(target);

        const siblings = Array.from(source.parentNode.children);
        undo_history.push(
            {s: siblings.indexOf(source), t: siblings.indexOf(target), a: amount}
        );

        setTimeout(() => {
            cap_full_with_single_color(source);
            save_level();
            check_win(true);
            check_button_status();
            is_pouring = false;
        }, ANIMATION_DURATION);
    }

}

function cap_full_with_single_color(bottle) {
    if (bottle.children.length == 1 && get_height(bottle.lastChild) == BOTTLE_HEIGHT) {
        bottle.classList.add("capped");
        bottle.onpointerdown = null;
    } else if (bottle.classList.contains("capped")) {
        bottle.classList.remove("capped");
        set_pointer_action(bottle, select_bottle);
    }
}

function check_win(advance) {
    for (const bottle of document.getElementById("game").lastChild.children) {
        if (bottle.children.length != 0 && !bottle.classList.contains("capped")) {
            return false;
        }
    }
    if (advance) {
        increment_level();
        next_level();
    }

    return true;
}

function increment_level() {
    const old_level = parseInt(localStorage.getItem("water-level"));
    localStorage.setItem("water-level", old_level + 1 + "");
}

function next_level() {
    const current_level = parseInt(localStorage.getItem("water-level"));
    apply_level_ui_color(current_level);
    const level = make_level(current_level);
    show_level_number();
    transition_level(level);
}

function apply_level_ui_color(level) {
    const color_index = (level - 1) % ui_color_list.length;
    document.documentElement.style.setProperty("--ui-color", ui_color_list[color_index]);
}

function display(message) {
    clearTimeout(message_timeout);
    const level_no = document.getElementById("level-no");
    const text = message.trim();
    if (!text) {
        show_level_number();
        return;
    }
    level_no.textContent = text;
    message_timeout = setTimeout(show_level_number, 3000);
}

function show_level_number() {
    clearTimeout(message_timeout);
    message_timeout = null;
    const level = localStorage.getItem("water-level") || "1";
    document.getElementById("level-no").textContent = `#${level.padStart(4, "0")}`;
}

function make_level(n) {
    let bottles = make_level_new(n);

    // cleanup
    for (const bottle of bottles) {
        for (let i = bottle.children.length - 1; i > 0; i--) {
            if (bottle.children[i].style.backgroundColor != bottle.children[i - 1].style.backgroundColor) {
                continue;
            }
            add_height(bottle.children[i - 1], get_height(bottle.children[i]));
            bottle.removeChild(bottle.children[i]);
        }
        cap_full_with_single_color(bottle);
    }

    let level = document.createElement("div");
    level.classList.add("level");
    level.replaceChildren(...bottles);
    return level;
}

function make_level_new(n) {
    let bottles = [];

    const random = random_generator(n);
    const difficulty = Math.log(n) * 1.5 + 2;
    const color_count = Math.floor(difficulty);
    const layer_size = Math.floor(15 / Math.log10(n + 3) - 15 / n);

    // make full bottles first
    for (let i = 0; i < color_count; i++) {
        const color = color_list[i % color_list.length];
        bottles.push(add_bottle(color));
    }
    // two extra empty bottles
    for (let i = color_count; i < 2 + color_count; i++) {
        bottles.push(add_bottle());
    }

    const move = (source, target, amount) => {
        amount = Math.min(amount, get_bottle_space(target));
        if (amount == 0) {console.log("zero move during levelgen");}
        add_water(target, source.lastChild.style.backgroundColor, amount);
        remove_water(source, amount);
    };
    // move something into one of the empty bottles
    move(
        bottles[random(color_count)],
        bottles[color_count],
        (random(Math.floor(BOTTLE_HEIGHT / layer_size - 1)) + 1) * layer_size
    );

    const last_bottle = bottles[color_count + 1];
    let movable = bottles.slice(0, -1);
    for (let loops = 0; loops < 1000; loops++) {

        // check all bottles if they have enough space to be moved
        for (let i = movable.length - 1; i >= 0; i--) {
            if (get_height(movable[i].lastChild) < layer_size * 2) {
                movable.splice(i, 1);
            }
        }
        // generate chains until all splits are too small for defined difficulty
        if (movable.length < 2) {
            break;
        }

        // then generate a chain move which will be solved by moving something into
        // the last empty bottle, then in a row filling some water into the just emptied space
        // and finally emptying the bottle
        let chain = [last_bottle];
        let opts = movable.slice();
        let amount = layer_size + random(3);
        let difficulty_ramp = Math.floor((opts.length - 2) * (difficulty - color_count));
        let chain_length = Math.min(2 + random(opts.length - 1) + random(difficulty_ramp), opts.length);
        for (let i = 0; i < chain_length; i++) {
            let x = random(opts.length);
            chain.push(opts[x]);
            opts.splice(x, 1);
        }

        let move_made = false;
        for (let i = 0; i < chain.length - 1; i++) {
            // each chain move does a bottom split of the top color,
            // leaving space for any move generated above
            let amt = get_height(chain[i + 1].lastChild) - amount;
            if (amt <= 0) {
                chain.splice(i + 1, 1);
                i--;
                continue;
            }
            move_made = true;
            move(chain[i + 1], chain[i], amt);
            // for each step, generate a chance that something has to be moved into the bottle
            // during the operation from a bottle not participating in the chain
            let target_space = get_bottle_space(chain[i + 1]);
            if (target_space > amount && opts.length && random(opts.length) * random(movable.length) == 1) {
                let third = random(opts.length);
                if (get_height(opts[third].lastChild) > amount * 2) {
                    move(opts[third], chain[i + 1], Math.min(amount, target_space - amount));
                }
                opts.splice(third, 1);
            }
        }
        if (move_made) {
            move(last_bottle, chain[chain.length - 1], get_height(last_bottle.lastChild));
        }
        for (const target of bottles) {
            if (!last_bottle.children.length) {
                break;
            }
            if (get_bottle_space(target) > 0) {
                move(last_bottle, target, get_height(last_bottle.lastChild));
            }
        }
    }
    return bottles;
}

// Random seeded generator from some person bryc on the internet
// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript#comment101315527_47593316

function random_generator(seed) {
    // Pad seed with Phi, Pi and E.
    // https://en.wikipedia.org/wiki/Nothing-up-my-sleeve_number
    let a = 0x9E3779B9, b = 0x243F6A88, c = 0xB7E15162;
    let d = seed ^ 0xDEADBEEF; // 32-bit seed with optional XOR value

    const sfc32 = (range) => {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        d = d + 1 | 0;
        t = t + d | 0;
        c = c + t | 0;
        return Math.floor((t >>> 0) * range / 4294967296);
    };

    for (let i = 0; i < 15; i++) sfc32();
    return sfc32;
}


function start_game() {
    let level = parseInt(localStorage.getItem("water-level"));
    if (!level) {
        level = 1;
        localStorage.setItem("water-level", "1");
    }
    apply_level_ui_color(level);
    let level_data = load_level();
    if (!level_data) {
        level_data = make_level(level);
    }
    show_level_number();

    const game = document.getElementById("game");
    game.appendChild(level_data);
    requestAnimationFrame(() => layout_level(level_data));

    setup_toolbar();
    check_win();
}


function transition_level(level) {
    const game = document.getElementById("game");
    game.replaceChildren(level);
    requestAnimationFrame(() => layout_level(level));
    check_button_status();
}

function layout_level(level = document.getElementById("game").lastChild) {
    if (!level?.children.length) return;
    const bottle_width = 36;
    const minimum_gap = 16;
    const columns = Math.max(1, Math.floor((level.clientWidth + minimum_gap) / (bottle_width + minimum_gap)));
    const bottles = Array.from(level.children);
    const last_row_count = bottles.length % columns || columns;
    level.style.setProperty("--level-columns", columns);
    bottles.forEach(bottle => bottle.style.gridColumn = "auto");
    if (last_row_count === columns) return;

    bottles.slice(-last_row_count).forEach((bottle, index) => {
        const column = last_row_count === 1
            ? Math.ceil(columns / 2)
            : Math.round(index * (columns - 1) / (last_row_count - 1)) + 1;
        bottle.style.gridColumn = column;
    });
}

function save_level(level = null) {
    if (level == null) {
        level = document.getElementById("game").lastChild;
    }
    let level_data = [];
    for (const bottle of level.children) {
        let bottle_data = [];
        for (const fluid of bottle.children) {
            bottle_data.push({c: fluid.style.backgroundColor, a: get_height(fluid)});
        }
        level_data.push(bottle_data);
    }
    localStorage.setItem("water-save", JSON.stringify(level_data));
    localStorage.setItem("water-undo", JSON.stringify(undo_history));
    localStorage.setItem("water-saved-level-no", localStorage.getItem("water-level"));
}

function load_level() {
    try {
        if (localStorage.getItem("water-saved-level-no") != localStorage.getItem("water-level")) {
            return false;
        }
        const save_data = localStorage.getItem("water-save");
        if (!save_data) {
            return false;
        }
        const level_data = JSON.parse(save_data);
        let bottles = [];
        for (const bottle_data of level_data) {
            let bottle = add_bottle();
            for (const fluid_data of bottle_data) {
                add_water(bottle, fluid_data.c, fluid_data.a);
            }
            cap_full_with_single_color(bottle);
            bottles.push(bottle);
        }
        let game = document.createElement("div");
        game.classList.add("level");
        game.replaceChildren(...bottles);
        const saved_undo = JSON.parse(localStorage.getItem("water-undo"));
        undo_history = Array.isArray(saved_undo) ? saved_undo : [];
        return game;
    }
    catch (err) {
        console.error("Error loading level data: " + err.message);
        return;
    }
}

function setup_toolbar() {
    document.body.onpointerdown = event => {
        event.preventDefault();
        event.stopPropagation();
    };
    window.addEventListener("resize", () => requestAnimationFrame(() => layout_level()));
    set_pointer_action(document.getElementById("reset-button"), reset_level);
    set_pointer_action(document.getElementById("undo-button"), perform_undo);
    set_pointer_action(document.getElementById("level-no"), change_level);
    check_button_status();
}

function change_level() {
    if (is_pouring) return;
    const current_level = parseInt(localStorage.getItem("water-level"));
    const value = window.prompt("Go to level:", current_level);
    if (value === null) {
        return;
    }

    const level = Number(value);
    if (!Number.isInteger(level) || level < 1) {
        return;
    }
    if (!window.confirm(`Go to level #${String(level).padStart(4, "0")}?`)) {
        return;
    }

    localStorage.setItem("water-level", level);
    undo_history = [];
    next_level();
}

function reset_level() {
    if (is_pouring) return;
    if (!window.confirm("Reset this level?")) return;
    let level;
    let saved_undo = [];
    try {
        const parsed_undo = JSON.parse(localStorage.getItem("water-undo"));
        saved_undo = Array.isArray(parsed_undo) ? parsed_undo : [];
    } catch (err) {
        console.error("Error loading undo data: " + err.message);
    }
    if (undo_history.length || !saved_undo.length) {
        level = make_level(parseInt(localStorage.getItem("water-level")));
        undo_history = [];
    } else {
        level = load_level();
        if (!level) {
            return;
        }
    }
    transition_level(level);
    check_button_status();
    check_win();
}

function perform_undo() {
    if (is_pouring) return;
    const event = undo_history.pop();
    if (!event) {
        return;
    }
    const bottles = document.getElementById("game").lastChild.children;
    add_water(bottles[event.s], bottles[event.t].lastChild.style.backgroundColor, event.a, true);
    remove_water(bottles[event.t], event.a, true);
    cap_full_with_single_color(bottles[event.t]);
    check_button_status();
    save_level();
}

function check_button_status() {
    const inactive = document.getElementById("undo-button").classList.contains("inactive");
    if (undo_history.length && inactive) {
        document.getElementById("undo-button").classList.remove("inactive");
    } else if (!undo_history.length && !inactive) {
        document.getElementById("undo-button").classList.add("inactive");
    }
}

const BOTTLE_HEIGHT = 40;
const WATER_UNIT = 4;
const ANIMATION_DURATION = 300;

function get_height(water) {
    return Math.round(parseFloat(water.style.height || "0") / WATER_UNIT);
}

function add_height(water, amount, transition) {
    const height = (get_height(water) || 0) + amount;
    const initial_style = water.style.height || "0px";
    water.style.height = height * WATER_UNIT + "px";
    if (transition) {
        water.animate(
            {height: [initial_style, water.style.height]},
            {duration: ANIMATION_DURATION, easing: "ease-in-out"}
        );
    }
}

function get_bottle_space(bottle) {
    let bottle_space = BOTTLE_HEIGHT;
    for (const water of bottle.children) {
        bottle_space -= get_height(water);
    }
    return bottle_space;
}

function add_water(bottle, color, amount, transition) {
    if (bottle.lastChild && bottle.lastChild.style.backgroundColor == color) {
        add_height(bottle.lastChild, amount, transition);
        return;
    }
    let fluid = document.createElement("div");
    fluid.classList.add("water");
    fluid.style.backgroundColor = color;
    add_height(fluid, amount, transition);
    bottle.appendChild(fluid);
}


function remove_water(bottle, amount, transition) {
    if (amount < get_height(bottle.lastChild)) {
        add_height(bottle.lastChild, -amount, transition);
    } else {
        const water = bottle.lastChild;
        if (transition) {
            const initial_height = water.style.height;
            water.style.height = "0px";
            water.animate(
                {height: [initial_height, "0px"]},
                {duration: ANIMATION_DURATION, easing: "ease-in-out"}
            );
            setTimeout(() => {
                if (water.parentNode === bottle) {
                    bottle.removeChild(water);
                }
            }, ANIMATION_DURATION);
        } else {
            bottle.removeChild(water);
        }
    }
}

function add_bottle(color) {
    const bottle = document.createElement("div");
    bottle.classList.add("bottle");
    set_pointer_action(bottle, select_bottle);
    if (color) {
        add_water(bottle, color, BOTTLE_HEIGHT);
    }
    return bottle;
}
