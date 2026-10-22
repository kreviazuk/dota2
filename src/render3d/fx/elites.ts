import { groundHeight } from '../coords';
import { registerFx, registerProjectileStyle } from './registry';

// 弹道注册
registerProjectileStyle('satyr_shockwave', {
  mesh: 'wave',
  color: 0xba68c8,
  halo: 16,
  size: 32,
});

// 半人马：战争践踏
registerFx('centaur_war_stomp', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 250;
  c.fx.ring(x, y, 20, r, 0xeab308, 0.45, 36);
  c.fx.ring(x, y, r * 0.6, r * 1.05, 0xca8a04, 0.35, 16);
  c.fx.decalFlash(x, y, r * 0.8, 0x854d0e, 0.5);
  c.fx.burst(x, y, gy + 30, 26, 0x78350f, 420, 8, 0.45, true, { grav: 280 });
  if (c.cam.visible(e.pos)) c.cam.shake(8);
});

// 萨特：震荡波起手
registerFx('satyr_shockwave', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  c.fx.ring(x, y, 10, 80, 0xba68c8, 0.35, 14);
  c.fx.burst(x, y, gy + 40, 18, 0xce93d8, 280, 7, 0.4, true, { grav: 150 });
});

// 黑龙：火海喷吐
registerFx('dragon_fireball', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 180;
  c.fx.ring(x, y, 15, r, 0xef4444, 0.5, 30);
  c.fx.ring(x, y, 10, r * 0.8, 0xf97316, 0.4, 20);
  c.fx.decalFlash(x, y, r * 0.9, 0xb91c1c, 0.6);
  c.fx.burst(x, y, gy + 25, 32, 0xf97316, 360, 8, 0.5, true, { up: 60 });
});

// 肉山：巨力猛击
registerFx('roshan_slam', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 350;
  c.fx.ring(x, y, 30, r, 0xd97706, 0.6, 50);
  c.fx.ring(x, y, r * 0.7, r * 1.05, 0xf59e0b, 0.4, 22);
  c.fx.decalFlash(x, y, r * 0.85, 0x78350f, 0.65);
  c.fx.burst(x, y, gy + 50, 42, 0x451a03, 560, 10, 0.6, true, { grav: 340 });
  c.fx.burst(x, y, gy + 30, 24, 0xd97706, 380, 12, 0.5, true, { flat: true, up: 40 });
  if (c.cam.visible(e.pos)) c.cam.shake(14);
});

// 肉山：降临
registerFx('roshan_spawn', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  c.fx.ring(x, y, 40, 450, 0xf59e0b, 0.8, 60);
  c.fx.beam(x, y, 60, 500, 0xffd54f, 0.7);
  c.fx.burst(x, y, gy + 60, 50, 0xf59e0b, 600, 10, 0.8, true, { up: 120 });
  if (c.cam.visible(e.pos)) c.cam.shake(16);
});

// 肉山：击杀
registerFx('roshan_death', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  c.fx.ring(x, y, 30, 380, 0xdc2626, 0.8, 45);
  c.fx.burst(x, y, gy + 40, 60, 0xfbbf24, 520, 10, 0.9, true, { grav: 200 });
  if (c.cam.visible(e.pos)) c.cam.shake(12);
});
