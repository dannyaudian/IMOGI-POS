frappe.ready(function() {
    if (imogi_pos.kitchen_display) {
        if (!CURRENT_BRANCH) {
            frappe.show_alert({
                message: __('No branch selected. The Kitchen Display will determine the appropriate branch automatically.'),
                indicator: 'orange',
            });
        }

        if (DOMAIN !== 'Restaurant') {
            frappe.show_alert({
                message: __('Page not available for this domain'),
                indicator: 'red',
            });
        }

        imogi_pos.kitchen_display.init();
    }
});

document.addEventListener("DOMContentLoaded", function () {
    // Initialize dropdown and events
    const kitchenSelector = document.querySelector("#kitchen-selector");
    const stationSelector = document.querySelector("#station-selector");

    if (kitchenSelector) {
        kitchenSelector.addEventListener('change', function () {
            const selectedKitchen = kitchenSelector.value;
            console.log("Selected Kitchen:", selectedKitchen);
            fetchTickets(selectedKitchen);
        });
    }

    if (stationSelector) {
        stationSelector.addEventListener('change', function () {
            const selectedStation = stationSelector.value;
            console.log("Selected Station:", selectedStation);
            fetchTickets('', selectedStation);
        });
    }

    // Fetch tickets and update columns
    async function fetchTickets(selectedKitchen = '', selectedStation = '') {
        try {
            const response = await frappe.call({
                method: 'imogi_pos.api.kot.get_kots_for_kitchen',
                args: {
                    kitchen: selectedKitchen,
                    station: selectedStation,
                    branch: settings.branch
                }
            });
            const kots = response.message || [];
            renderColumns(kots);
        } catch (error) {
            console.error("Error fetching KOT tickets:", error);
        }
    }

    // Render each column based on KOT status
    function renderColumns(kots) {
        const queuedContainer = document.querySelector("#queued-container");
        const preparingContainer = document.querySelector("#preparing-container");
        const readyContainer = document.querySelector("#ready-container");

        const queuedCount = kots.filter(kot => kot.workflow_state === 'Queued').length;
        const preparingCount = kots.filter(kot => kot.workflow_state === 'In Progress').length;
        const readyCount = kots.filter(kot => kot.workflow_state === 'Ready').length;

        document.querySelector("#queued-count").innerText = queuedCount;
        document.querySelector("#preparing-count").innerText = preparingCount;
        document.querySelector("#ready-count").innerText = readyCount;

        renderKotColumn(queuedContainer, kots.filter(kot => kot.workflow_state === 'Queued'), 'Queued');
        renderKotColumn(preparingContainer, kots.filter(kot => kot.workflow_state === 'In Progress'), 'In Progress');
        renderKotColumn(readyContainer, kots.filter(kot => kot.workflow_state === 'Ready'), 'Ready');
    }

    function renderKotColumn(container, kots, status) {
        if (!container) return;
        container.innerHTML = ''; // Clear existing content
        if (kots.length === 0) {
            container.innerHTML = `<div class="empty-column"><p>No ${status.toLowerCase()} orders</p></div>`;
            return;
        }

        kots.forEach(kot => {
            const kotCard = document.createElement('div');
            kotCard.classList.add('kot-card');
            kotCard.classList.add(kot.workflow_state.toLowerCase().replace(' ', '-'));
            kotCard.dataset.kot = kot.name;

            kotCard.innerHTML = `
                <div class="kot-header">
                    <div class="kot-info">
                        <div class="kot-id">${kot.name}</div>
                        <div class="kot-time">${formatElapsedTime(kot.creation)}</div>
                    </div>
                    <div class="kot-meta">
                        <div class="kot-order">${kot.pos_order || 'N/A'}</div>
                        <div class="kot-table">${kot.table || 'N/A'}</div>
                    </div>
                </div>
                <div class="kot-items">
                    ${kot.items.map(item => renderKotItem(item)).join('')}
                </div>
                <div class="kot-actions">
                    ${kot.workflow_state === 'Queued' ? `<button class="start-btn">Start Preparing</button>` : ''}
                    ${kot.workflow_state === 'In Progress' ? `<button class="mark-ready-btn">Mark Ready</button>` : ''}
                    ${kot.workflow_state === 'In Progress' || kot.workflow_state === 'Ready' ? `<button class="mark-served-btn">Mark Served</button>` : ''}
                </div>
            `;

            kotCard.querySelector(".start-btn")?.addEventListener('click', () => updateKotStatus(kot.name, 'In Progress'));
            kotCard.querySelector(".mark-ready-btn")?.addEventListener('click', () => updateKotStatus(kot.name, 'Ready'));
            kotCard.querySelector(".mark-served-btn")?.addEventListener('click', () => updateKotStatus(kot.name, 'Served'));

            container.appendChild(kotCard);
        });
    }

    function renderKotItem(item) {
        return `
            <div class="kot-item">
                <div class="kot-item-name">${item.item_name}</div>
                <div class="kot-item-qty">${item.qty}x</div>
                <div class="kot-item-status">${item.status}</div>
            </div>
        `;
    }

    function formatElapsedTime(creationTime) {
        const elapsedSeconds = Math.floor((new Date() - new Date(creationTime)) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const hours = Math.floor(minutes / 60);
        const formattedTime = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
        return formattedTime;
    }

    function updateKotStatus(kotName, newStatus) {
        frappe.call({
            method: 'imogi_pos.api.kot.update_kot_status',
            args: { kot_ticket: kotName, state: newStatus },
            callback: function(response) {
                if (response.message) {
                    console.log(`KOT ${kotName} updated to ${newStatus}`);
                    fetchTickets();  // Refresh data setelah update
                } else {
                    console.error("Failed to update KOT status.");
                }
            },
            error: function(err) {
                console.error("Error updating KOT status:", err);
            }
        });
    }

    // Real-time update for KOT status
    frappe.realtime.on('kitchen:all', function(data) {
        if (data.action === 'update_kot_status') {
            updateKotStatus(data.kot_name, data.status);
        }
    });
});
