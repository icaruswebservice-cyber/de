// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
// Barra de navegación lateral izquierda (solo escritorio), igual al Deriv Bot
// original: logo arriba, Home y Reports; abajo Language, Theme y Log out.
// Language / Theme / Log out se movieron aquí desde el footer.
import { observer } from 'mobx-react-lite';
import brandConfig from '@/../brand.config.json';
import { standalone_routes } from '@/components/shared';
import { useApiBase } from '@/hooks/useApiBase';
import { useLogout } from '@/hooks/useLogout';
import useModalManager from '@/hooks/useModalManager';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { getActiveTabUrl } from '@/utils/getActiveTabUrl';
import { FILTERED_LANGUAGES } from '@/utils/languages';
import { generateUrlWithRedirect } from '@/utils/url-redirect-utils';
import { useTranslations } from '@deriv-com/translations';
import { DesktopLanguagesModal } from '@deriv-com/ui';
import { AppLogo } from '../app-logo';
import './sidebar.scss';

const HomeIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='24' height='24' role='img'>
        <path d='M15.57 6.656a.65.65 0 0 1 .82 0l10.626 9.375c.273.235.273.625.078.899-.235.273-.625.273-.899.039l-1.445-1.29v7.696a3.11 3.11 0 0 1-3.125 3.125h-11.25c-1.758 0-3.125-1.367-3.125-3.125V15.68l-1.484 1.289c-.235.234-.664.234-.86-.04-.234-.273-.234-.663.04-.898zm-7.07 7.93v8.789c0 1.055.82 1.875 1.875 1.875h11.25c1.016 0 1.875-.82 1.875-1.875v-8.79l-7.5-6.6z' />
    </svg>
);

const ReportsIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='24' height='24' role='img'>
        <path d='M22.75 24V14h-4.375a1.85 1.85 0 0 1-1.875-1.875V7.75h-5c-.703 0-1.25.586-1.25 1.25v15c0 .703.547 1.25 1.25 1.25h10c.664 0 1.25-.547 1.25-1.25m-.04-11.25c-.038-.078-.077-.195-.155-.273l-4.532-4.532c-.078-.078-.195-.117-.273-.156v4.336c0 .352.273.625.625.625zM9 9c0-1.367 1.094-2.5 2.5-2.5h6.094c.468 0 .976.234 1.328.586l4.492 4.492c.352.352.586.86.586 1.328V24c0 1.406-1.133 2.5-2.5 2.5h-10A2.47 2.47 0 0 1 9 24z' />
    </svg>
);

const LanguageIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='24' height='24' role='img'>
        <path d='M16 25.25c.625 0 1.563-.547 2.383-2.227.39-.78.742-1.718.976-2.773h-6.718c.195 1.055.547 1.992.937 2.773.82 1.68 1.758 2.227 2.422 2.227M12.406 19h7.149c.117-.781.195-1.602.195-2.5 0-.86-.078-1.68-.195-2.5h-7.149a17.6 17.6 0 0 0-.156 2.5c0 .898.04 1.719.156 2.5m.235-6.25h6.718a11.8 11.8 0 0 0-.976-2.734C17.563 8.336 16.625 7.75 16 7.75c-.664 0-1.602.586-2.422 2.266-.39.78-.742 1.68-.937 2.734M20.844 14c.078.82.156 1.64.156 2.5 0 .898-.078 1.719-.156 2.5h3.515a8.6 8.6 0 0 0 .391-2.5c0-.86-.156-1.68-.39-2.5zm3.047-1.25a8.88 8.88 0 0 0-5.118-4.531c.82 1.094 1.485 2.695 1.836 4.531zm-12.54 0c.391-1.836 1.016-3.437 1.836-4.531A8.88 8.88 0 0 0 8.07 12.75zM7.602 14a9 9 0 0 0-.351 2.5c0 .898.117 1.719.352 2.5h3.554c-.117-.781-.156-1.602-.156-2.5 0-.86.04-1.68.156-2.5zm11.172 10.82a8.82 8.82 0 0 0 5.118-4.57h-3.282c-.351 1.875-1.015 3.438-1.836 4.57m-5.585 0c-.82-1.133-1.446-2.695-1.836-4.57H8.07a8.82 8.82 0 0 0 5.118 4.57M16 26.5c-3.594 0-6.875-1.875-8.672-5-1.797-3.086-1.797-6.875 0-10 1.797-3.086 5.078-5 8.672-5 3.555 0 6.836 1.914 8.633 5 1.797 3.125 1.797 6.914 0 10a9.93 9.93 0 0 1-8.633 5' />
    </svg>
);

const ThemeIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='24' height='24' role='img'>
        <path d='M15.922 9.117A7.51 7.51 0 0 0 9.75 16.5c0 4.18 3.32 7.5 7.46 7.5a7.77 7.77 0 0 0 3.673-.937c-4.14-.352-7.422-3.868-7.422-8.125 0-2.266.937-4.336 2.46-5.82m2.578-.82a.56.56 0 0 1-.273.664 6.85 6.85 0 0 0-3.516 5.977 6.86 6.86 0 0 0 6.875 6.874c.39 0 .781 0 1.172-.078.273-.039.547.078.664.313.117.273.078.547-.117.742a8.7 8.7 0 0 1-6.094 2.461c-4.805 0-8.711-3.906-8.711-8.75 0-4.805 3.906-8.75 8.71-8.75.235 0 .509.04.743.04.274.038.508.233.547.507' />
    </svg>
);

const LogoutIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='24' height='24' role='img'>
        <path d='m24.71 16.46-5.155-4.882a.3.3 0 0 0-.196-.078c-.117 0-.234.117-.234.273V14a.64.64 0 0 1-.625.625h-4.687a.31.31 0 0 0-.313.313v3.124c0 .196.117.313.313.313H18.5c.313 0 .625.313.625.625v2.266c0 .117.117.234.234.234.078 0 .157 0 .196-.04l5.156-4.882s.039-.039.039-.078zm1.29.04c0 .39-.156.742-.43 1.016l-5.156 4.843c-.273.274-.664.391-1.055.391-.82 0-1.484-.664-1.484-1.484v-1.641h-4.062c-.899 0-1.563-.664-1.563-1.562v-3.125c0-.86.664-1.563 1.563-1.563h4.062v-1.602c0-.82.664-1.523 1.484-1.523.391 0 .782.156 1.055.43l5.156 4.843c.274.274.43.625.43.977M12.875 9h-3.75C8.07 9 7.25 9.86 7.25 10.875v11.25C7.25 23.18 8.07 24 9.125 24h3.75c.313 0 .625.313.625.625a.64.64 0 0 1-.625.625h-3.75C7.367 25.25 6 23.883 6 22.125v-11.25A3.11 3.11 0 0 1 9.125 7.75h3.75c.313 0 .625.313.625.625a.64.64 0 0 1-.625.625' />
    </svg>
);

const AppSidebar = observer(() => {
    const { currentLang = 'EN', localize, switchLanguage } = useTranslations();
    const { hideModal, isModalOpenFor, showModal } = useModalManager();
    const { isAuthorized } = useApiBase();
    const { toggleTheme } = useThemeSwitcher();
    const handleLogout = useLogout();

    // Misma configuración de marca que usaba el footer.
    const enableLanguageSettings = brandConfig.platform.footer?.enable_language_settings ?? true;
    const enableThemeToggle = brandConfig.platform.footer?.enable_theme_toggle ?? true;

    return (
        <aside className='app-sidebar' aria-label={localize('Main navigation')}>
            <div className='app-sidebar__section app-sidebar__section--top'>
                <div className='app-sidebar__logo'>
                    <AppLogo />
                </div>
                <a href='/home.html' className='app-sidebar__item' aria-label={localize('Home')}>
                    <HomeIcon />
                    <span className='app-sidebar__label'>{localize('Home')}</span>
                </a>
                <a
                    href={generateUrlWithRedirect(standalone_routes.positions)}
                    className='app-sidebar__item'
                    aria-label={localize('Reports')}
                >
                    <ReportsIcon />
                    <span className='app-sidebar__label'>{localize('Reports')}</span>
                </a>
            </div>

            <div className='app-sidebar__section app-sidebar__section--bottom'>
                {enableLanguageSettings && (
                    <button
                        type='button'
                        className='app-sidebar__item'
                        onClick={() => showModal('DesktopLanguagesModal')}
                        aria-label={`${localize('Change language')} - ${localize('Current language')}: ${currentLang}`}
                        aria-expanded='false'
                        aria-haspopup='dialog'
                    >
                        <LanguageIcon />
                        <span className='app-sidebar__label'>{localize('Language')}</span>
                    </button>
                )}
                {enableThemeToggle && (
                    <button
                        type='button'
                        className='app-sidebar__item'
                        onClick={toggleTheme}
                        aria-label={localize('Change theme')}
                    >
                        <ThemeIcon />
                        <span className='app-sidebar__label'>{localize('Theme')}</span>
                    </button>
                )}
                {isAuthorized && (
                    <button
                        type='button'
                        className='app-sidebar__item'
                        onClick={handleLogout}
                        aria-label={localize('Log out')}
                    >
                        <LogoutIcon />
                        <span className='app-sidebar__label'>{localize('Log out')}</span>
                    </button>
                )}
            </div>

            {enableLanguageSettings && isModalOpenFor('DesktopLanguagesModal') && (
                <DesktopLanguagesModal
                    headerTitle={localize('Select Language')}
                    isModalOpen
                    languages={FILTERED_LANGUAGES}
                    onClose={hideModal}
                    onLanguageSwitch={code => {
                        try {
                            switchLanguage(code);
                            hideModal();
                            // Blockly vive fuera del ciclo de React: hace falta recargar.
                            window.location.replace(getActiveTabUrl());
                        } catch (error) {
                            console.error('Failed to switch language:', error);
                            hideModal();
                        }
                    }}
                    selectedLanguage={currentLang}
                />
            )}
        </aside>
    );
});

export default AppSidebar;
