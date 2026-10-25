import { loadShadersFromURLS, buildProgramFromSources, setupWebGL } from "../../libs/utils.js";
import { vec2, vec4, flatten } from "../../libs/MV.js";

// MISSING FUNCTIONALITIES (double check if I missed anything here)
// drag both the canvas and individual sites
// scroll wheel zoom (also increase border delta with zoom for the borders to increase or decrease size)
// resize keeping aspect-ratio (only whe reducing or increasing the height, keep the width the same, I think)

const MAX_SITES = 64;
const MAX_BORDER_DELTA = 5.0;
const MAX_DELETE_DIST = 10.0;
const MAX_DIST = 999999999.0;
const EUCLIDEAN_METRIC = 0;
const MANHATTAN_METRIC = 1;
const CHEBYSHEV_METRIC = 2;

/** @type {HTMLCanvasElement} */
let canvas;
/** @type {WebGL2RenderingContext} */
let gl;

let program;
let quad_vao;       // the quad covering the whole viewport

let site_pos = new Float32Array(MAX_SITES * 2);
let site_color = new Float32Array(MAX_SITES * 4);
let site_num = 0;
let metric = EUCLIDEAN_METRIC;
let border_delta = MAX_BORDER_DELTA;
let is_depth = false;

// Dimensions for the aspect-ratio persevation 
let base_width;
let base_height;
let aspect_ratio;

// ---------------------------------------------------------------------------
// Input. The event listeners are already set up in setup_input(); fill in
// these functions. Mouse positions are in canvas pixels, with (0, 0) at the
// top-left corner and y growing downwards.
// ---------------------------------------------------------------------------

let is_mouse_down = false;
let is_drag_canvas = false;
let is_drag_site = false;
let curr_site_idx = -1;

let start_drag = vec2(0.0, 0.0);
let last_drag = vec2(0.0, 0.0);

let last_mouse_pos = vec2(0.0, 0.0);

let zoom = 1.0;

function on_mouse_down(x, y) {
	is_mouse_down = true
	start_drag = vec2(x, y);
	last_drag = vec2(x, y);

	curr_site_idx = get_closest_site_idx(x, y);

	if (curr_site_idx >= 0) {
		is_drag_site = true;
		is_drag_canvas = false;
	} else {
		is_drag_site = false;
		is_drag_canvas = false;
	}
}

function on_mouse_move(x, y) {
	last_mouse_pos = vec2(x, y);

	if (!is_mouse_down) {
		return;
	}

	let dx = x - last_drag[0];
	let dy = y - last_drag[1];

	let total_dx = x - start_drag[0];
	let total_dy = y - start_drag[1];
	let drag_dist = Math.sqrt(Math.pow(total_dx, 2) + Math.pow(total_dy, 2));

	if (is_drag_site && (curr_site_idx >= 0)) {
		site_pos[curr_site_idx * 2] = x;
		site_pos[curr_site_idx * 2 + 1] = y;
	} else if (drag_dist > 5.0) {
		is_drag_canvas = true;
		for (let i = 0; i < site_num; i++) {
			site_pos[i * 2] += dx;
			site_pos[i * 2 + 1] += dy;
		}
	}

	last_drag = vec2(x, y);
}

function on_mouse_up(x, y) {
	let total_dx = x - start_drag[0];
	let total_dy = y - start_drag[1];
	let drag_dist = Math.sqrt(Math.pow(total_dx, 2) + Math.pow(total_dy, 2));

	if (site_num < MAX_SITES && !is_drag_canvas && !is_drag_site && drag_dist < 5.0) {
		site_pos[site_num * 2] = x;
		site_pos[site_num * 2 + 1] = y;
		let color = get_random_color();
		site_color[site_num * 4] = color[0];
		site_color[site_num * 4 + 1] = color[1];
		site_color[site_num * 4 + 2] = color[2];
		site_color[site_num * 4 + 3] = color[3];
		site_num += 1;
	}

	is_mouse_down = false;
	is_drag_canvas = false;
	is_drag_site = false;
	curr_site_idx = -1;
}

// dy > 0 when the wheel is scrolled down (towards the user)
function on_wheel(x, y, dy) {
	let zoom_factor = dy > 0 ? 0.9 : 1.1;

	zoom *= zoom_factor;

	for (let i = 0; i < site_num; i++) {
		let px = site_pos[i * 2];
		let py = site_pos[i * 2 + 1];

		site_pos[i * 2] = x + (px - x) * zoom_factor;
		site_pos[i * 2 + 1] = y + (py - y) * zoom_factor;
	}

	if (border_delta > 0) {
		border_delta = MAX_BORDER_DELTA * zoom;
	}
}

function on_key(key) {
	switch (key) {
		case '1':
			metric = EUCLIDEAN_METRIC;
			break;
		case '2':
			metric = MANHATTAN_METRIC;
			break;
		case '3':
			metric = CHEBYSHEV_METRIC;
			break;
		case 'b':       // toggle cell borders
			if (border_delta > 0.0) {
				border_delta = 0.0;
			} else {
				border_delta = MAX_BORDER_DELTA * zoom;
			}
			break;
		case 'x':       // remove the site under the pointer
			let idx = get_closest_site_idx();
			if (idx >= 0) delete_site(idx);
			break;
		case 'm':       // switch rendering technique / split view
			is_depth = !is_depth;
			break;
	}
}

function get_random_color() {
	return vec4(Math.random(), Math.random(), Math.random(), 1.0);
}

function get_closest_site_idx(x = last_mouse_pos[0], y = last_mouse_pos[1]) {
	let min_dist = MAX_DIST;
	let min_site_idx = -1;

	for (let i = 0; i < site_num; i++) {
		let a = Math.pow(site_pos[i * 2] - x, 2)
		let b = Math.pow(site_pos[i * 2 + 1] - y, 2)
		let dist = Math.sqrt(a + b);

		if (dist < MAX_DELETE_DIST && dist < min_dist) {
			min_dist = dist;
			min_site_idx = i;
		}
	}
	return min_site_idx;
}

function delete_site(idx) {
	let new_site_pos = new Float32Array(MAX_SITES * 2);
	let new_site_color = new Float32Array(MAX_SITES * 4);

	let j = 0;

	for (let i = 0; i < site_num; i++) {
		if (i == idx) continue;

		new_site_pos[j * 2] = site_pos[i * 2];
		new_site_pos[j * 2 + 1] = site_pos[i * 2 + 1];

		new_site_color[j * 4] = site_color[i * 4];
		new_site_color[j * 4 + 1] = site_color[i * 4 + 1];
		new_site_color[j * 4 + 2] = site_color[i * 4 + 2];
		new_site_color[j * 4 + 3] = site_color[i * 4 + 3];

		j++;
	}

	site_pos.set(new_site_pos);
	site_color.set(new_site_color);
	site_num--;
}


// ---------------------------------------------------------------------------

function resize() {
	// Match the canvas's drawing buffer to the size it is shown at, and
	// draw over all of it
	base_width = window.innerWidth;
	base_height = window.innerHeight;
	aspect_ratio = base_height / base_width;

	canvas.width = base_width;
	canvas.height = base_width * aspect_ratio;
	gl.viewport(0, 0, canvas.width, canvas.height);
}

function setup_input() {
	canvas.addEventListener("mousedown", (event) => on_mouse_down(event.offsetX, canvas.height - event.offsetY));
	canvas.addEventListener("mousemove", (event) => on_mouse_move(event.offsetX, canvas.height - event.offsetY));
	window.addEventListener("mouseup", (event) => on_mouse_up(event.offsetX, canvas.height - event.offsetY));
	canvas.addEventListener("wheel", (event) => {
		on_wheel(event.offsetX, canvas.height - event.offsetY, event.deltaY);
		event.preventDefault();     // don't let the page scroll as well
	});
	window.addEventListener("keydown", (event) => on_key(event.key));
}

function setup(shaders) {
	canvas = document.getElementById("gl-canvas");
	gl = setupWebGL(canvas);

	base_width = window.innerWidth;
	base_height = window.innerHeight;
	aspect_ratio = base_height / base_width;

	program = buildProgramFromSources(gl, shaders["quad.vert"], shaders["quad.frag"]);

	// A quad covering the whole viewport, as two triangles: its corners are
	// the corners of clip space, from (-1, -1) to (1, 1)
	const corners = new Float32Array([
		-1, -1, 1, -1, 1, 1,       // first triangle
		-1, -1, 1, 1, -1, 1,       // second triangle
	]);

	quad_vao = gl.createVertexArray();
	gl.bindVertexArray(quad_vao);

	const buffer_viewport = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer_viewport);
	gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);

	const a_position = gl.getAttribLocation(program, "a_position");
	gl.enableVertexAttribArray(a_position);
	gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

	gl.bindVertexArray(null);

	resize();
	window.addEventListener("resize", resize);
	setup_input();

	gl.clearColor(0.0, 0.0, 0.0, 1.0);

	window.requestAnimationFrame(animate);
}

function animate(timestamp) {
	window.requestAnimationFrame(animate);

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	gl.useProgram(program);

	const u_site_pos = gl.getUniformLocation(program, "u_site_position[0]");
	gl.uniform2fv(u_site_pos, site_pos);
	const u_site_color = gl.getUniformLocation(program, "u_site_color[0]");
	gl.uniform4fv(u_site_color, site_color);
	const u_site_n = gl.getUniformLocation(program, "u_n_sites");
	gl.uniform1i(u_site_n, site_num);
	const u_metric = gl.getUniformLocation(program, "u_metric");
	gl.uniform1i(u_metric, metric);
	const u_border_delta = gl.getUniformLocation(program, "u_border_delta");
	gl.uniform1f(u_border_delta, border_delta);
	const u_is_depth = gl.getUniformLocation(program, "u_is_depth");
	gl.uniform1i(u_is_depth, is_depth);
	const u_viewport_width = gl.getUniformLocation(program, "u_viewport_width");
	gl.uniform1i(u_viewport_width, canvas.width);
	const u_viewport_height = gl.getUniformLocation(program, "u_viewport_height");
	gl.uniform1i(u_viewport_height, canvas.height);

	// add center uniform u_center

	if (is_depth && site_num > 0) {
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LESS);

		let vertex_count = (metric == EUCLIDEAN_METRIC) ? 66 : 6;

		gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, vertex_count, site_num);
	} else {
		gl.bindVertexArray(quad_vao);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}
	gl.bindVertexArray(null);
	gl.useProgram(null);
}

loadShadersFromURLS(["quad.vert", "quad.frag"]).then(shaders => setup(shaders));
