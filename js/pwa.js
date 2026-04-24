if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            registration.update().catch(() => {
                // Ignore update-check failures; normal registration still works.
            });
        }).catch((error) => {
            console.error('Service worker registration failed:', error);
        });
    });
}
