/**
 * @template T
 * @param {() => T} factory
 * @returns {() => T}
 */
export function createLazyValue(factory) {
    let initialized = false;
    let value;
    return () => {
        if (!initialized) {
            value = factory();
            initialized = true;
        }
        return value;
    };
}
