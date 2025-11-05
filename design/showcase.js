/**
 * Command Center Design System Showcase
 * Interactive demonstrations and features
 */

document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializeInteractiveElements();
    initializeCopyFeatures();
});

// =============================================================================
// Navigation
// =============================================================================
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.showcase-section');

    // Highlight active nav link based on scroll position
    const observerOptions = {
        root: null,
        rootMargin: '-100px 0px -80% 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }, observerOptions);

    sections.forEach(section => observer.observe(section));

    // Smooth scroll with offset for sticky nav
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            const navHeight = document.querySelector('.showcase-nav').offsetHeight;
            const targetPosition = targetSection.offsetTop - navHeight - 20;

            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        });
    });
}

// =============================================================================
// Interactive Elements
// =============================================================================
function initializeInteractiveElements() {
    // Toggle switch demo
    const toggleSwitches = document.querySelectorAll('.toggle-switch input');
    toggleSwitches.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            console.log('Toggle state:', e.target.checked);
            // Add visual feedback
            const slider = e.target.nextElementSibling;
            if (e.target.checked) {
                slider.style.animation = 'toggle-check 0.3s ease';
            }
        });
    });

    // Button ripple effect
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');

            this.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });
    });

    // Interactive card hover effects
    const interactiveCards = document.querySelectorAll('.interactive-card');
    interactiveCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.02) translateY(-2px)';
        });

        card.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) translateY(0)';
        });

        card.addEventListener('mousedown', function() {
            this.style.transform = 'scale(0.98)';
        });

        card.addEventListener('mouseup', function() {
            this.style.transform = 'scale(1.02) translateY(-2px)';
        });
    });

    // Animated progress bar demo
    animateProgressBar();
}

// =============================================================================
// Copy Code Features
// =============================================================================
function initializeCopyFeatures() {
    // Add copy buttons to code examples (can be expanded)
    const colorCards = document.querySelectorAll('.color-card');

    colorCards.forEach(card => {
        card.addEventListener('click', () => {
            const hexCode = card.querySelector('.color-hex').textContent;
            copyToClipboard(hexCode);
            showCopyNotification(card, 'Copied!');
        });
    });
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('Copied to clipboard:', text);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function showCopyNotification(element, message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(59, 126, 255, 0.95);
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        pointer-events: none;
        z-index: 1000;
        animation: fade-in-out 1.5s ease;
    `;

    element.style.position = 'relative';
    element.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 1500);
}

// =============================================================================
// Animations
// =============================================================================
function animateProgressBar() {
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        let progress = 0;
        const interval = setInterval(() => {
            progress += 1;
            progressBar.style.width = `${progress}%`;

            if (progress >= 68) {
                clearInterval(interval);
            }
        }, 20);
    }
}

// =============================================================================
// CSS Animations (injected)
// =============================================================================
const style = document.createElement('style');
style.textContent = `
    @keyframes toggle-check {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
    }

    @keyframes fade-in-out {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
    }

    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple-animation 0.6s ease-out;
        pointer-events: none;
    }

    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }

    .nav-link.active {
        color: #3B7EFF;
        border-bottom-color: #3B7EFF;
    }

    .color-card {
        cursor: pointer;
    }

    .color-card:active {
        transform: scale(0.98);
    }
`;
document.head.appendChild(style);

// =============================================================================
// Keyboard Shortcuts
// =============================================================================
document.addEventListener('keydown', (e) => {
    // Press 'C' to copy current section URL
    if (e.key === 'c' && e.ctrlKey) {
        const activeSection = document.querySelector('.showcase-section:hover');
        if (activeSection) {
            const id = activeSection.getAttribute('id');
            const url = `${window.location.origin}${window.location.pathname}#${id}`;
            copyToClipboard(url);
            showGlobalNotification('Section URL copied!');
        }
    }
});

function showGlobalNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(59, 126, 255, 0.95);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.15);
        z-index: 10000;
        animation: slide-in 0.3s ease, slide-out 0.3s ease 2.7s;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

const animationStyles = document.createElement('style');
animationStyles.textContent = `
    @keyframes slide-in {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slide-out {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(animationStyles);

// =============================================================================
// Console Easter Egg
// =============================================================================
console.log('%c🎨 Command Center Design System', 'font-size: 20px; font-weight: bold; color: #3B7EFF;');
console.log('%cBuilt with attention to detail and love for great design', 'font-size: 12px; color: #6B7280;');
console.log('%cPress Ctrl+C while hovering over a section to copy its URL', 'font-size: 11px; color: #9CA3AF;');
