import type {Theme} from '@darkreader/definitions';
import type {HSLA} from '@darkreader/utils/color';

export function getBackgroundPoles(_theme: Theme): [string, string] {
    return ['', ''];
}

export function getTextPoles(_theme: Theme): [string, string] {
    return ['', ''];
}

export function modifyBgColorExtended(color: HSLA, _pole: HSLA, _anotherPole: HSLA): HSLA {
    return color;
}

export function modifyFgColorExtended(color: HSLA, _pole: HSLA, _anotherPole: HSLA): HSLA {
    return color;
}

export function modifyLightSchemeColorExtended(color: HSLA, _pole: HSLA, _anotherPole: HSLA): HSLA {
    return color;
}

export function extendThemeCacheKeys(_keys: Array<keyof Theme>): void {
}
