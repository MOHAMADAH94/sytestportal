import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, } from 'react';
const STORAGE_KEY = 'sytest-theme';
const THEME_COLORS = {
    dark: '#010C0A',
    light: '#F6F1E4',
};
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta)
        meta.setAttribute('content', THEME_COLORS[theme]);
}
const ThemeContext = createContext(null);
export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(() => {
        if (typeof document === 'undefined')
            return 'dark';
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    });
    useEffect(() => {
        applyTheme(theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        }
        catch {
            /* ignore quota / private mode */
        }
    }, [theme]);
    const setTheme = useCallback((next) => {
        setThemeState(next === 'light' ? 'light' : 'dark');
    }, []);
    const toggleTheme = useCallback(() => {
        setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
    }, []);
    const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
    return _jsx(ThemeContext.Provider, { value: value, children: children });
}
export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx)
        throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
