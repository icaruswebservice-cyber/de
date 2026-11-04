/**
 * Custom in-page dialogs for bot-app.
 *
 * Replaces the native browser alert/prompt so the browser does not display
 * the real website origin (for example: "deriv-59qo.onrender.com says:").
 */

export const DIALOG_LABEL = 'bot.deriv.me dice';

// Estilo del cuadro de resultado del bot, elegido en Notificaciones > "Resultado del bot":
//  - 'center' (predeterminado): cuadro en el centro de la pantalla.
//  - 'top': cuadro arriba, como el aviso nativo de Chrome ("bot.deriv.me says").
export const BOT_ALERT_STYLE_KEY = 'tradelab-bot-alert-style';
export const DIALOG_LABEL_TOP = 'bot.deriv.me says';

function getAlertStyle(): 'center' | 'top' {
    try {
        return window.localStorage.getItem(BOT_ALERT_STYLE_KEY) === 'top' ? 'top' : 'center';
    } catch {
        return 'center';
    }
}

let overlayEl: HTMLDivElement | null = null;

function buildOverlay(): {
    overlay: HTMLDivElement;
    box: HTMLDivElement;
    message: HTMLDivElement;
} {
    const overlay = document.createElement('div');

    overlay.setAttribute('data-testid', 'bot-dialog-overlay');

    Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '99999',
    });

    const box = document.createElement('div');

    Object.assign(box.style, {
        background: '#4e4d51',
        border: '1px solid #3a3a3c',
        borderRadius: '14px',
        padding: '32px 20px',
        width: 'calc(100% - 40px)',
        maxWidth: '440px',
        minHeight: '160px',
        boxSizing: 'border-box',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '15px',
        color: '#fff',
    });

    const label = document.createElement('div');

    label.textContent = DIALOG_LABEL;

    Object.assign(label.style, {
        marginBottom: '14px',
        fontSize: '19px',
        fontWeight: '700',
        color: '#fff',
    });

    const message = document.createElement('div');

    message.setAttribute('data-testid', 'bot-dialog-message');

    Object.assign(message.style, {
        marginBottom: '20px',
        fontSize: '14px',
        lineHeight: '1.4',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: '#d1d1d6',
    });

    box.appendChild(label);
    box.appendChild(message);
    overlay.appendChild(box);

    return {
        overlay,
        box,
        message,
    };
}

function mount(): {
    overlay: HTMLDivElement;
    box: HTMLDivElement;
    message: HTMLDivElement;
} {
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
    }

    const dialog = buildOverlay();

    overlayEl = dialog.overlay;

    document.body.appendChild(dialog.overlay);

    return dialog;
}

function unmount(): void {
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
    }
}

function makeButton(text: string): HTMLButtonElement {
    const button = document.createElement('button');

    button.type = 'button';
    button.textContent = text;

    Object.assign(button.style, {
        minWidth: '48px',
        height: '34px',
        padding: '6px 10px',
        border: 'none',
        borderRadius: '0',
        background: 'transparent',
        color: '#0a84ff',
        cursor: 'pointer',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '15px',
        fontWeight: '600',
        boxSizing: 'border-box',
    });

    return button;
}

/**
 * Custom replacement for window.alert().
 */
export function showBotAlert(msg?: unknown): Promise<void> {
    if (getAlertStyle() === 'top') return showTopAlert(msg);

    return new Promise(resolve => {
        const { box, message } = mount();

        message.textContent = msg === undefined ? '' : String(msg);

        const actions = document.createElement('div');

        Object.assign(actions.style, {
            display: 'flex',
            justifyContent: 'flex-end',
        });

        const okButton = makeButton('Aceptar');

        okButton.addEventListener('click', () => {
            unmount();
            resolve();
        });

        actions.appendChild(okButton);
        box.appendChild(actions);

        okButton.focus();
    });
}

/**
 * Aviso arriba, con el diseño del cuadro nativo de Chrome en modo oscuro.
 */
function showTopAlert(msg?: unknown): Promise<void> {
    return new Promise(resolve => {
        if (overlayEl) {
            overlayEl.remove();
            overlayEl = null;
        }

        const overlay = document.createElement('div');

        overlay.setAttribute('data-testid', 'bot-dialog-overlay');
        Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '99999', background: 'transparent' });

        const box = document.createElement('div');

        Object.assign(box.style, {
            position: 'absolute',
            top: '0',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 28px)',
            maxWidth: '449px',
            boxSizing: 'border-box',
            padding: '20px 20px 20px',
            background: '#1b1c1c',
            border: '1px solid #454646',
            borderRadius: '14px',
            boxShadow: '0 4px 23px rgba(0, 0, 0, 0.55)',
            fontFamily: 'Roboto, "Segoe UI", Arial, Helvetica, sans-serif',
            color: '#e3e3e3',
        });

        const title = document.createElement('div');

        title.textContent = DIALOG_LABEL_TOP;
        Object.assign(title.style, { fontSize: '16px', fontWeight: '600', lineHeight: '22px', marginBottom: '9px' });

        const message = document.createElement('div');

        message.setAttribute('data-testid', 'bot-dialog-message');
        message.textContent = msg === undefined ? '' : String(msg);
        Object.assign(message.style, {
            fontSize: '13px',
            lineHeight: '18px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
        });

        const actions = document.createElement('div');

        Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', marginTop: '12px' });

        const ok = document.createElement('button');

        ok.type = 'button';
        ok.textContent = 'OK';
        Object.assign(ok.style, {
            minWidth: '66px',
            height: '36px',
            margin: '4px 4px 4px 0',
            padding: '0 16px',
            border: '0',
            borderRadius: '20px',
            background: '#bdcdcf',
            color: '#253553',
            font: '500 14px Roboto, "Segoe UI", Arial, Helvetica, sans-serif',
            cursor: 'pointer',
            outline: 'none',
            boxShadow: '0 0 0 2px #1b1c1c, 0 0 0 4px #bdcdcf',
        });
        ok.addEventListener('click', () => {
            overlay.remove();
            if (overlayEl === overlay) overlayEl = null;
            resolve();
        });

        actions.appendChild(ok);
        box.appendChild(title);
        box.appendChild(message);
        box.appendChild(actions);
        overlay.appendChild(box);
        overlayEl = overlay;
        document.body.appendChild(overlay);
        ok.focus();
    });
}

/**
 * Custom replacement for window.prompt().
 */
export function showBotPrompt(
    msg?: unknown,
    defaultValue = ''
): Promise<string | null> {
    return new Promise(resolve => {
        const { box, message } = mount();

        message.textContent = msg === undefined ? '' : String(msg);

        const input = document.createElement('input');

        input.type = 'text';
        input.value = defaultValue;

        Object.assign(input.style, {
            width: '100%',
            height: '34px',
            padding: '6px 10px',
            marginBottom: '20px',
            boxSizing: 'border-box',
            border: '1px solid #3a3a3c',
            borderRadius: '8px',
            background: '#2c2c2e',
            color: '#fff',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '14px',
            outline: 'none',
        });

        const actions = document.createElement('div');

        Object.assign(actions.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
        });

        const cancelButton = makeButton('Cancelar');

        cancelButton.addEventListener('click', () => {
            unmount();
            resolve(null);
        });

        const okButton = makeButton('Aceptar');

        okButton.addEventListener('click', () => {
            const value = input.value;

            unmount();
            resolve(value);
        });

        box.appendChild(input);
        box.appendChild(actions);

        actions.appendChild(cancelButton);
        actions.appendChild(okButton);

        input.focus();
        input.select();
    });
}

/**
 * Expose the functions globally because Blockly-generated JavaScript
 * executes them through the window object.
 */
(window as any).showBotAlert = showBotAlert;
(window as any).showBotPrompt = showBotPrompt;
