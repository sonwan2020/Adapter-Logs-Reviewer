/**
 * Adapter Logs Reviewer — Frontend application.
 * Handles tab switching and will be extended with AJAX loading in later tasks.
 */

document.addEventListener("DOMContentLoaded", () => {
    // Tab switching
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
        });
    });
});
