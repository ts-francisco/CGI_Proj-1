#version 300 es

precision highp float;
precision highp int;

const float MAX_DIST = 1e20f;
const int MAX_SITES = 64;

const int EUCLIDEAN_METRIC = 0;
const int MANHATTAN_METRIC = 1;
const int CHEBYSHEV_METRIC = 2;

const float SITE_RADIUS = 10.0f;

uniform vec2 u_site_position[MAX_SITES];
uniform vec4 u_site_color[MAX_SITES];
uniform int u_n_sites;
uniform int u_metric; // 0 Euclidean, 1 Manhattan, 2 Chebyshev
uniform float u_border_delta;
uniform bool u_is_depth;

in vec4 v_color;

out vec4 color;

float get_euclidean_dist(vec2 a, vec2 b) {
	float x = a.x - b.x;
	float y = a.y - b.y;
	return sqrt(x * x + y * y);
}

float get_manhattan_dist(vec2 a, vec2 b) {
	return abs(a.x - b.x) + abs(a.y - b.y);
}

float get_chebyshev_dist(vec2 a, vec2 b) {
	return max(abs(a.x - b.x), abs(a.y - b.y));
}

vec3 get_min_dist_idx() {
	vec2 pos;
	vec4 color;

	float min_dist = MAX_DIST;
	int idx = -1;
	float sec_min_dist = MAX_DIST; // the distance of the second nearest site
	int sec_idx = -1; // the idx of the second nearest site

	float curr_dist = 0.0f;

	for(int i = 0; i < u_n_sites; i++) {
		pos = u_site_position[i];
		color = u_site_color[i];

		switch(u_metric) {
			case EUCLIDEAN_METRIC:
				curr_dist = get_euclidean_dist(gl_FragCoord.xy, pos);
				break;
			case MANHATTAN_METRIC:
				curr_dist = get_manhattan_dist(gl_FragCoord.xy, pos);
				break;
			case CHEBYSHEV_METRIC:
				curr_dist = get_chebyshev_dist(gl_FragCoord.xy, pos);
				break;
		}

		if(curr_dist < min_dist) {
			sec_min_dist = min_dist;
			sec_idx = idx;
			min_dist = curr_dist;
			idx = i;
		}
	}
	return vec3(min_dist, idx, sec_min_dist);
}

bool is_site(float dist) {
	return (dist < SITE_RADIUS);
}

bool is_border(float min_dist, float sec_min_dist) {
	return (abs(min_dist - sec_min_dist) < u_border_delta);
}

void main() {

	if(u_n_sites == 0) {
		color = vec4(0.2f, 0.4f, 0.6f, 1.0f);
		return;
	}

	if(u_is_depth) {
		color = v_color;
	} else {
		vec3 dist_idx = get_min_dist_idx();
		float min_dist = dist_idx[0];
		int min_idx = int(dist_idx[1]);
		float sec_min_dist = dist_idx[2];
		if(is_site(min_dist)) {
			color = vec4(1.0f, 1.0f, 1.0f, 1.0f);
		} else if(is_border(min_dist, sec_min_dist)) {
			color = vec4(1.0f, 1.0f, 1.0f, 1.0f);
		} else {
			color = u_site_color[int(min_idx)];
		}
	}

	// I don't know if they want me to do calculations like below or not when is_depth is true
	// The safe bet is just using the code above or adding the calculations to quad.vert

	// the site dot and border calculations should happen separately from the min-distance calculation
	// in the project info images, the dots don't change shape with different metrics

	// vec3 dist_idx = get_min_dist_idx();
	// float min_dist = dist_idx[0];
	// int min_idx = int(dist_idx[1]);
	// float sec_min_dist = dist_idx[2];

	// if(is_site(min_dist)) {
		// color = vec4(1.0f, 1.0f, 1.0f, 1.0f);
	// } else if(is_border(min_dist, sec_min_dist)) {
		// color = vec4(1.0f, 1.0f, 1.0f, 1.0f);
	// } else {
		// if(u_is_depth) {
			// color = v_color;
		// } else {
			// color = u_site_color[int(min_idx)];
		// }
	// }
}
