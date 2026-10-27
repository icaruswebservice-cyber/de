import classnames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import ThemedScrollbars from '../shared_ui/themed-scrollbars';
import SummaryCard from './summary-card';

type TSummary = {
    is_drawer_open: boolean;
};

const Summary = observer(({ is_drawer_open }: TSummary) => {
    const { dashboard, summary_card } = useStore();
    const { is_contract_loading, contract_info, is_bot_running } = summary_card;
    const { active_tour } = dashboard;
    const { isDesktop } = useDevice();
    // Sin contratos todavía: el panel ocupa todo el alto disponible para que
    // el texto "When you’re ready to trade..." quede centrado en el medio.
    const is_empty = !is_contract_loading && !contract_info && !is_bot_running;
    return (
        <div
            className={classnames({
                'run-panel-tab__content': isDesktop,
                'run-panel-tab__content--mobile': !isDesktop && is_drawer_open,
                'run-panel-tab__content--summary-tab': (isDesktop && is_drawer_open) || active_tour,
                'run-panel-tab__content--summary-empty': isDesktop && is_empty,
            })}
            data-testid='mock-summary'
        >
            <ThemedScrollbars
                className={classnames({
                    summary: (!is_contract_loading && !contract_info) || is_bot_running,
                    'summary--loading':
                        (!isDesktop && is_contract_loading) || (!isDesktop && !is_contract_loading && contract_info),
                })}
            >
                <SummaryCard
                    is_contract_loading={is_contract_loading}
                    contract_info={contract_info}
                    is_bot_running={is_bot_running}
                />
            </ThemedScrollbars>
        </div>
    );
});

export default Summary;
