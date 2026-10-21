import { register } from 'node:module'

/* 单测不启动 DSH：把 @deepseek-ai/dsh-tools 换成只返回定义本身的替身（它的入口会连带加载整套 DSH 运行时） */
register('./stub-hooks.mjs', import.meta.url)
