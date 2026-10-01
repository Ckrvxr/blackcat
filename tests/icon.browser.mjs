// Verify the source module and generated userscript against the actual design asset.
export async function assertPanelIcon(root) {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const icon = root.querySelector('header > svg.brand');
    assert(icon, 'Settings header must use the project SVG instead of a B placeholder');
    assert(icon.getAttribute('aria-hidden') === 'true' && icon.getAttribute('focusable') === 'false', 'The icon beside the title should be decorative and unfocusable');
    const bounds = icon.getBoundingClientRect();
    assert(bounds.width === 32 && bounds.height === 32, 'Brand icon should remain 32 × 32 pixels');
    const response = await fetch('/assets/blackcat.svg');
    assert(response.ok, 'Project icon asset should be available to the test');
    const expected = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
    assert(icon.getAttribute('viewBox') === expected.getAttribute('viewBox'), 'Icon viewBox must match the design asset');
    const shapes = (svg) => [...svg.querySelectorAll('rect, path')].map((shape) => ({
        tag: shape.localName,
        namespace: shape.namespaceURI,
        attributes: [...shape.attributes]
            .filter(({name}) => name !== 'style' && !name.startsWith('data-darkreader-'))
            .map(({name, value}) => [name, value]),
    }));
    assert(JSON.stringify(shapes(icon)) === JSON.stringify(shapes(expected)), 'Rendered icon geometry must match assets/blackcat.svg');
    const renderedShapes = [...icon.querySelectorAll('[fill]')];
    for (const [index, shape] of [...expected.querySelectorAll('[fill]')].entries()) {
        const swatch = document.createElement('span');
        swatch.style.color = shape.getAttribute('fill');
        assert(getComputedStyle(renderedShapes[index]).fill === swatch.style.color, 'Dark Reader must not recolor the project icon');
    }
}
