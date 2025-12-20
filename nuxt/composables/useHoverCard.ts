import { useElementBounding } from '@vueuse/core';
import { userStore } from '~/plugins/state';

// Global state to track currently open hover card
const globalOpenHoverCard = ref<any>(null);

export const useHoverCard = (item: any) => {
    const cardContainer = ref(null);
    const { top, left, width, height } = useElementBounding(cardContainer);
    const cardBounds = computed(() => ({
        top: top.value,
        left: left.value,
        width: width.value,
        height: height.value
    }));

    const showHoverCard = ref(false);
    const showModal = ref(false);
    const fullItem = ref<any>(null);
    let hoverTimer: any = null;
    let closeTimer: any = null;
    const userData = userStore();

    // Sync fullItem with props.item initially
    watch(() => item.value, (newItem) => {
        if (!fullItem.value) {
            fullItem.value = newItem;
        }
    }, { immediate: true });

    const onMouseEnter = async () => {
        // Only enable hover on desktop
        if (window.innerWidth < 768) return;

        clearTimeout(closeTimer);
        if (showHoverCard.value) return; // Already open

        hoverTimer = setTimeout(async () => {
            // Close any other open hover card first
            if (globalOpenHoverCard.value && globalOpenHoverCard.value !== showHoverCard) {
                globalOpenHoverCard.value.value = false;
            }

            // Fetch minimal info if not already loaded
            if (!fullItem.value?.videos) {
                try {
                    const type = item.value.title ? 'movie' : 'series';
                    const country = userData.loadInfo.countryCode || 'IN';
                    const data: any = await $fetch(`/api/${type}/${item.value.id}`, {
                        params: {
                            minimal: 'true',
                            country: country
                        }
                    });
                    fullItem.value = { ...item.value, ...data };
                } catch (e) {
                    console.error("Failed to fetch hover info", e);
                }
            }

            showHoverCard.value = true;
            globalOpenHoverCard.value = showHoverCard; // Track this as the currently open one
        }, 600); // 600ms delay
    };

    const onMouseLeave = () => {
        clearTimeout(hoverTimer);
        startClose();
    };

    const startClose = () => {
        closeTimer = setTimeout(() => {
            showHoverCard.value = false;
            if (globalOpenHoverCard.value === showHoverCard) {
                globalOpenHoverCard.value = null;
            }
        }, 150);
    };

    const cancelClose = () => {
        clearTimeout(closeTimer);
    };

    const navigateToPage = () => {
        const type = item.value.title ? 'movie' : 'series';
        useRouter().push(`/${type}/${item.value.id}/${getUrlSlug(item.value.title || item.value.name)}`);
    };

    const openModal = () => {
        showModal.value = true;
        showHoverCard.value = false;
        if (globalOpenHoverCard.value === showHoverCard) {
            globalOpenHoverCard.value = null;
        }
    };

    return {
        // Refs
        cardContainer,
        cardBounds,
        showHoverCard,
        showModal,
        fullItem,

        // Handlers
        onMouseEnter,
        onMouseLeave,
        cancelClose,
        startClose,
        navigateToPage,
        openModal
    };
};
