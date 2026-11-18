import {defineConfig,devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({
 testDir:here,
 testMatch:'acceptance.spec.mjs',
 outputDir:fileURLToPath(new URL('../browser-results',import.meta.url)),
 timeout:30000,
 expect:{timeout:8000},
 fullyParallel:true,
 forbidOnly:!!process.env.CI,
 retries:process.env.CI?1:0,
 workers:process.env.CI?2:undefined,
 reporter:[['list'],['junit',{outputFile:fileURLToPath(new URL('../browser-results/junit.xml',import.meta.url))}]],
 use:{baseURL:'http://127.0.0.1:4177',serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure',reducedMotion:'reduce',locale:'en-GH',timezoneId:'Africa/Accra',launchOptions:process.env.LUMO_TEST_CHROMIUM_EXECUTABLE?{executablePath:process.env.LUMO_TEST_CHROMIUM_EXECUTABLE}:{}},
 projects:[{name:'chromium-phone',use:{...devices['Pixel 5'],browserName:'chromium'}}],
 webServer:{command:'node '+JSON.stringify(fileURLToPath(new URL('./server.mjs',import.meta.url))),url:'http://127.0.0.1:4177/__fixture/health',reuseExistingServer:!process.env.CI,timeout:20000},
});
