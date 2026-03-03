/**
 * Vanilla JS Tilt Effect
 * Lightweight 3D tilt effect for profile cards
 */

document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.profile-card');

    cards.forEach(card => {
        // State
        let bounds;

        function rotateToMouse(e) {
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const leftX = mouseX - bounds.x;
            const topY = mouseY - bounds.y;
            const center = {
                x: leftX - bounds.width / 2,
                y: topY - bounds.height / 2
            }
            const distance = Math.sqrt(center.x ** 2 + center.y ** 2);

            card.style.transform = `
                scale3d(1.02, 1.02, 1.02)
                rotate3d(
                    ${center.y / 100},
                    ${-center.x / 100},
                    0,
                    ${Math.log(distance) * 2}deg
                )
            `;

            // Add light reflection effect if needed
            // card.querySelector('.profile-inner').style.backgroundImage = ...
        }

        card.addEventListener('mouseenter', () => {
            bounds = card.getBoundingClientRect();
            document.addEventListener('mousemove', rotateToMouse);
        });

        card.addEventListener('mouseleave', () => {
            document.removeEventListener('mousemove', rotateToMouse);
            card.style.transform = '';
        });
    });
});
