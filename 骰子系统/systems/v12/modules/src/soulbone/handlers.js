'use strict';

/**
 * 魂骨特性实现处理器登记表。
 *
 * 交接文档第十九节：任意需要的处理器未实现时，必须显式报告该定义不可用于正式讨伐，
 * 不能在界面展示完整特性却实际无效。所以池里每条特性的 handler 必须在这里有实现，
 * 否则该条不进入候选，只在 unavailable 中报告原因。
 *
 * 本包不预置任何正式魂骨特性处理器：特性效果由用户后续编写的池决定，
 * 参考实现不等于默认授予。拼接层可用 register() 注册真实处理器。
 */

function createHandlerRegistry(initial) {
  const handlers = new Map();
  function register(id, implementation) {
    if (typeof id !== 'string' || !id) throw new Error('处理器ID无效');
    if (typeof implementation !== 'function') throw new Error('处理器实现须为函数：' + id);
    if (handlers.has(id)) throw new Error('处理器重复注册：' + id);
    handlers.set(id, implementation);
    return api;
  }
  function has(id) {
    return handlers.has(id);
  }
  function get(id) {
    const handler = handlers.get(id);
    if (!handler) throw new Error('魂骨特性处理器未实现：' + id);
    return handler;
  }
  function list() {
    return [...handlers.keys()];
  }
  const api = Object.freeze({ register, has, get, list, size: () => handlers.size });
  if (initial) for (const [id, implementation] of Object.entries(initial)) register(id, implementation);
  return api;
}

module.exports = { createHandlerRegistry };
