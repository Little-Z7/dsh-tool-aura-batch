export async function resolve(specifier, context, next) {
  if (specifier === '@deepseek-ai/dsh-tools') return { url: new URL('./stub-dsh-tools.mjs', import.meta.url).href, shortCircuit: true }
  return next(specifier, context)
}
