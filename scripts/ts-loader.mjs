export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".js")) {
    try {
      return await nextResolve(specifier, context);
    } catch (error) {
      const tsSpecifier = `${specifier.slice(0, -3)}.ts`;
      try {
        return await nextResolve(tsSpecifier, context);
      } catch {
        throw error;
      }
    }
  }
  return nextResolve(specifier, context);
}
