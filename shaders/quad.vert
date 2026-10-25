#version 300 es
// The corners of the quad are already in clip space, so they pass straight
// through.

precision highp float;
precision highp int;

const float PI = 3.14159265f;
const float RADIUS = 1e5f;
const int MAX_SITES = 64;

const int EUCLIDEAN_METRIC = 0;
const int MANHATTAN_METRIC = 1;
const int CHEBYSHEV_METRIC = 2;

uniform vec2 u_site_position[MAX_SITES];
uniform vec4 u_site_color[MAX_SITES];
uniform int u_n_sites;
uniform int u_metric; // 0 Euclidean, 1 Manhattan, 2 Chebyshev
uniform bool u_is_depth;

uniform int u_viewport_width;
uniform int u_viewport_height;

in vec2 a_position;

out vec4 v_color;

vec2 get_euclidean_rim(float angle, float radius) {
	return radius * vec2(cos(angle), sin(angle));
}

vec2 get_manhattan_rim(float angle, float radius) {
	return radius * vec2(cos(angle), sin(angle));
}

vec2 get_chebyshev_rim(int rimIndex, float radius) {
	if(rimIndex % 4 == 0)
		return vec2(-radius, -radius);
	else if(rimIndex % 4 == 1)
		return vec2(radius, -radius);
	else if(rimIndex % 4 == 2)
		return vec2(radius, radius);
	else if(rimIndex % 4 == 3)
		return vec2(-radius, radius);
}

vec2 get_rim_shape(int rimIndex, float radius) {
	float angle;
	switch(u_metric) {
		case EUCLIDEAN_METRIC:
			angle = 2.0f * PI * float(rimIndex) / 64.0f;
			return get_euclidean_rim(angle, radius);
			break;
		case MANHATTAN_METRIC:
			angle = 0.5f * PI * float(rimIndex);
			return get_manhattan_rim(angle, radius);
			break;
		case CHEBYSHEV_METRIC:
			return get_chebyshev_rim(rimIndex, radius);
			break;
	}
}

void main() {
	if(!u_is_depth || u_n_sites == 0) {
		gl_Position = vec4(a_position, 0.0f, 1.0f);
		return;
	}

	vec2 site = u_site_position[gl_InstanceID];

	vec2 local_center = vec2(2.0f * site.x / float(u_viewport_width) - 1.0f, 2.0f * site.y / float(u_viewport_height) - 1.0f);

	if(gl_VertexID == 0)
		gl_Position = vec4(local_center, 0.0f, 1.0f);
	else {
		vec2 rim = get_rim_shape(gl_VertexID, RADIUS);
		vec2 pos = rim + site;
		vec2 global_pos = vec2(2.0f * pos.x / float(u_viewport_width) - 1.0f, 2.0f * pos.y / float(u_viewport_height) - 1.0f);

		float dist;

		if(u_metric == EUCLIDEAN_METRIC)
			dist = length(rim);
		else if(u_metric == MANHATTAN_METRIC)
			dist = abs(rim.x) + abs(rim.y);
		else if(u_metric == CHEBYSHEV_METRIC)
			dist = max(abs(rim.x), abs(rim.y));

		float depth = 2.0f * dist / RADIUS - 1.0f;

		gl_Position = vec4(global_pos, depth, 1.0f);
	}

	v_color = u_site_color[gl_InstanceID];
}
