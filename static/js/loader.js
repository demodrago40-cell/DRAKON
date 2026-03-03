/**
 * YUG Loader - Shows loading animation as popup box for 3 seconds on page navigation
 */

(function () {
    'use strict';

    // Create loader HTML with popup box
    function createLoader() {
        const loaderOverlay = document.createElement('div');
        loaderOverlay.id = 'page-loader';
        loaderOverlay.innerHTML = `
            <div class="loader-box">
                <!-- Gradient Definitions - Outside the flex container -->
                <svg height="0" width="0" style="position:absolute;">
                    <defs>
                        <linearGradient gradientUnits="userSpaceOnUse" y2="2" x2="0" y1="62" x1="0" id="yug-gradient-y">
                            <stop stop-color="#973BED"></stop>
                            <stop stop-color="#007CFF" offset="1"></stop>
                        </linearGradient>
                        <linearGradient gradientUnits="userSpaceOnUse" y2="0" x2="0" y1="64" x1="0" id="yug-gradient-u">
                            <stop stop-color="#FFC800"></stop>
                            <stop stop-color="#F0F" offset="1"></stop>
                            <animateTransform repeatCount="indefinite"
                                keySplines=".42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1"
                                keyTimes="0; 0.125; 0.25; 0.375; 0.5; 0.625; 0.75; 0.875; 1" dur="8s"
                                values="0 32 32;-270 32 32;-270 32 32;-540 32 32;-540 32 32;-810 32 32;-810 32 32;-1080 32 32;-1080 32 32"
                                type="rotate" attributeName="gradientTransform">
                            </animateTransform>
                        </linearGradient>
                        <linearGradient gradientUnits="userSpaceOnUse" y2="2" x2="0" y1="62" x1="0" id="yug-gradient-g">
                            <stop stop-color="#00E0ED"></stop>
                            <stop stop-color="#00DA72" offset="1"></stop>
                        </linearGradient>
                    </defs>
                </svg>

                <div class="loader-letters">
                    <!-- Letter Y -->
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 64 64" height="80" width="80">
                        <path stroke-linejoin="round" stroke-linecap="round" stroke-width="6" stroke="url(#yug-gradient-y)"
                            d="M 54.722656,3.9726563 A 2.0002,2.0002 0 0 0 54.941406,4 h 5.007813 C 58.955121,17.046124 49.099667,27.677057 36.121094,29.580078 a 2.0002,2.0002 0 0 0 -1.708985,1.978516 V 60 H 29.587891 V 31.558594 A 2.0002,2.0002 0 0 0 27.878906,29.580078 C 14.900333,27.677057 5.0448787,17.046124 4.0507812,4 H 9.28125 c 1.231666,11.63657 10.984383,20.554048 22.6875,20.734375 a 2.0002,2.0002 0 0 0 0.02344,0 c 11.806958,0.04283 21.70649,-9.003371 22.730469,-20.7617187 z"
                            class="yug-dash" pathLength="360">
                        </path>
                    </svg>

                    <!-- Letter U -->
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 64 64" height="80" width="80">
                        <path stroke-linejoin="round" stroke-linecap="round" stroke-width="6" stroke="url(#yug-gradient-u)"
                            d="M 4,4 h 4.6230469 v 25.919922 c -0.00276,11.916203 9.8364941,21.550422 21.7500001,21.296875 11.616666,-0.240651 21.014356,-9.63894 21.253906,-21.25586 a 2.0002,2.0002 0 0 0 0,-0.04102 V 4 H 56.25 v 25.919922 c 0,14.33873 -11.581192,25.919922 -25.919922,25.919922 a 2.0002,2.0002 0 0 0 -0.0293,0 C 15.812309,56.052941 3.998433,44.409961 4,29.919922 Z"
                            class="yug-dash" pathLength="360">
                        </path>
                    </svg>

                    <!-- Letter G -->
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 64 64" height="80" width="80">
                        <path stroke-linejoin="round" stroke-linecap="round" stroke-width="6" stroke="url(#yug-gradient-g)"
                            d="M 56,20 C 52,8 42,4 32,4 C 16,4 4,16 4,32 C 4,48 16,60 32,60 C 46,60 56,50 56,36 L 56,32 L 36,32"
                            class="yug-dash" pathLength="360">
                        </path>
                    </svg>
                </div>

                <div class="loader-text">Loading</div>
                <div class="loader-dots"><span></span><span></span><span></span></div>
            </div>
        `;
        document.body.appendChild(loaderOverlay);
        return loaderOverlay;
    }

    // Add loader styles
    function addLoaderStyles() {
        if (document.getElementById('loader-styles')) return;

        const style = document.createElement('style');
        style.id = 'loader-styles';
        style.textContent = `
            #page-loader {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 999999;
                opacity: 1;
                transition: opacity 0.4s ease-out;
            }

            #page-loader.fade-out {
                opacity: 0;
                pointer-events: none;
            }

            #page-loader.fade-out .loader-box {
                transform: scale(0.85);
                opacity: 0;
            }

            #page-loader .loader-box {
                background: linear-gradient(135deg, 
                    rgba(23, 21, 21, 0.1) 0%, 
                    rgba(20, 20, 20, 0.05) 100%);
                backdrop-filter: blur(16px) saturate(180%);
                -webkit-backdrop-filter: blur(16px) saturate(180%);
                border: 1px solid rgba(29, 28, 28, 0.18);
                border-radius: 24px;
                padding: 50px 60px 40px;
                box-shadow: 
                    0 8px 32px rgba(0, 0, 0, 0.37),
                    inset 0 0 0 1px rgba(20, 19, 19, 0.05),
                    0 0 60px rgba(151, 59, 237, 0.1),
                    0 0 100px rgba(0, 200, 255, 0.08);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
                animation: loaderPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                transition: transform 0.4s ease, opacity 0.4s ease;
            }

            @keyframes loaderPopIn {
                0% {
                    transform: scale(0.7);
                    opacity: 0;
                }
                100% {
                    transform: scale(1);
                    opacity: 1;
                }
            }

            #page-loader .loader-letters {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            #page-loader .loader-letters svg {
                display: block;
            }

            #page-loader .yug-dash {
                animation: yugDashArray 2s ease-in-out infinite,
                    yugDashOffset 2s linear infinite;
            }

            @keyframes yugDashArray {
                0% { stroke-dasharray: 0 1 359 0; }
                50% { stroke-dasharray: 0 359 1 0; }
                100% { stroke-dasharray: 359 1 0 0; }
            }

            @keyframes yugDashOffset {
                0% { stroke-dashoffset: 365; }
                100% { stroke-dashoffset: 5; }
            }

            #page-loader .loader-text {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 15px;
                font-weight: 500;
                color: rgba(255, 255, 255, 0.7);
                letter-spacing: 4px;
                text-transform: uppercase;
                margin-top: 8px;
            }

            #page-loader .loader-dots {
                display: flex;
                gap: 6px;
            }

            #page-loader .loader-dots span {
                width: 8px;
                height: 8px;
                background: linear-gradient(135deg, #973BED, #007CFF);
                border-radius: 50%;
                animation: dotBounce 1.4s ease-in-out infinite;
            }

            #page-loader .loader-dots span:nth-child(1) { animation-delay: 0s; }
            #page-loader .loader-dots span:nth-child(2) { animation-delay: 0.2s; }
            #page-loader .loader-dots span:nth-child(3) { animation-delay: 0.4s; }

            @keyframes dotBounce {
                0%, 80%, 100% {
                    transform: scale(0.6);
                    opacity: 0.5;
                }
                40% {
                    transform: scale(1);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Show loader
    function showLoader() {
        addLoaderStyles();
        let loader = document.getElementById('page-loader');
        if (!loader) {
            loader = createLoader();
        }
        loader.classList.remove('fade-out');
        loader.style.display = 'flex';
    }

    // Hide loader with fade out
    function hideLoader() {
        const loader = document.getElementById('page-loader');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 400);
        }
    }

    // Handle Slow Page Load - show loader if load takes > 1.5s
    function handlePageLoad() {
        if (document.readyState === 'complete') return;

        const loadTimeout = setTimeout(() => {
            showLoader();
        }, 1500);

        window.addEventListener('load', () => {
            clearTimeout(loadTimeout);
            hideLoader();
        });
    }

    // Handle Network Status
    function handleNetworkStatus() {
        window.addEventListener('offline', () => {
            const loader = document.getElementById('page-loader');
            if (loader) {
                const text = loader.querySelector('.loader-text');
                if (text) text.textContent = 'CONNECTION LOST';
            }
            showLoader();
        });
        window.addEventListener('online', () => {
            const loader = document.getElementById('page-loader');
            if (loader) {
                const text = loader.querySelector('.loader-text');
                if (text) text.textContent = 'LOADING';
            }
            hideLoader();
        });
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            handlePageLoad();
            handleNetworkStatus();
        });
    } else {
        handlePageLoad();
        handleNetworkStatus();
    }

    // Export functions for manual use
    window.YUGLoader = {
        show: showLoader,
        hide: hideLoader
    };
})();
