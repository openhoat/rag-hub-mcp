// Transport configuration guards. Kept as a pure, side-effect-free module so
// the validation logic can be unit-tested without triggering the top-level
// server bootstrap in index.ts.
export const requireHttpApiKey = (isHttp: boolean, apiKey: string): boolean => {
  return !isHttp || apiKey.trim() !== ''
}
