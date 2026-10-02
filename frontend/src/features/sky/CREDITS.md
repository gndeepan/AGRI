# Live sky: credits

The shaders and code in this folder were written for Bhoomi AI. The techniques follow published work:

- **webgl-weather** by HugoluizMTB (MIT), https://github.com/HugoluizMTB/webgl-weather.
  Pass structure (sky, then rain, then glass), stateless rain particles derived from the vertex id,
  Marshall–Palmer (1948) drop sizes and Atlas et al. (1973) fall speeds, and Open-Meteo as the driver.
- **atmosphere** by takustaqu (MIT), https://github.com/takustaqu/atmosphere.
  Projecting cloud layers onto planes along the view ray, hash-scheduled lightning, and a light probe
  for lighting foreground objects.
- **Rain & Water Effect Experiments** by Lucas Bebber / Codrops,
  https://tympanus.net/codrops/2015/11/04/rain-water-effect-experiments/.
  The idea of drops as small lenses refracting a blurred background. No Codrops code is used;
  our drops are generated procedurally in the fragment shader.

Sun and moon positions and the moon phase come from `suncalc` (BSD-2-Clause).
