/**
 * Copyright 2021 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import expect from 'expect';
import http from 'http';
import os from 'os';
import {
  getTestState,
  describeFailsFirefox,
  itFailsWindows,
} from './mocha-utils.js';
import type {Server, IncomingMessage, ServerResponse} from 'http';
import type {Browser} from '../../lib/cjs/puppeteer/common/Browser.js';
import type {AddressInfo} from 'net';
import {TestServer} from '../../utils/testserver/lib/index.js';

const HOSTNAME = os.hostname().toLowerCase();

/**
 * Requests to localhost do not get proxied by default. Create a URL using the hostname
 * instead.
 */
function getEmptyPageUrl(server: TestServer): string {
  const emptyPagePath = new URL(server.EMPTY_PAGE).pathname;

  return `http://${HOSTNAME}:${server.PORT}${emptyPagePath}`;
}

describeFailsFirefox('request proxy', () => {
  let browser: Browser;
  let proxiedRequestUrls: string[];
  let proxyServer: Server;
  let proxyServerUrl: string;
  const defaultArgs = [
    '--disable-features=NetworkTimeServiceQuerying', // We disable this in tests so that proxy-related tests don't intercept queries from this service in headful.
  ];

  beforeEach(() => {
    proxiedRequestUrls = [];

    proxyServer = http
      .createServer(
        (
          originalRequest: IncomingMessage,
          originalResponse: ServerResponse
        ) => {
          proxiedRequestUrls.push(originalRequest.url as string);

          const proxyRequest = http.request(
            originalRequest.url as string,
            {
              method: originalRequest.method,
              headers: originalRequest.headers,
            },
            proxyResponse => {
              originalResponse.writeHead(
                proxyResponse.statusCode as number,
                proxyResponse.headers
              );
              proxyResponse.pipe(originalResponse, {end: true});
            }
          );

          originalRequest.pipe(proxyRequest, {end: true});
        }
      )
      .listen();

    proxyServerUrl = `http://${HOSTNAME}:${
      (proxyServer.address() as AddressInfo).port
    }`;
  });

  afterEach(async () => {
    await browser.close();

    await new Promise((resolve, reject) => {
      proxyServer.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve(undefined);
        }
      });
    });
  });

  it('should proxy requests when configured', async () => {
    const {puppeteer, defaultBrowserOptions, server} = getTestState();
    const emptyPageUrl = getEmptyPageUrl(server);

    browser = await puppeteer.launch({
      ...defaultBrowserOptions,
      args: [...defaultArgs, `--proxy-server=${proxyServerUrl}`],
    });

    const page = await browser.newPage();
    const response = (await page.goto(emptyPageUrl))!;

    expect(response.ok()).toBe(true);

    expect(proxiedRequestUrls).toEqual([emptyPageUrl]);
  });

  it('should respect proxy bypass list', async () => {
    const {puppeteer, defaultBrowserOptions, server} = getTestState();
    const emptyPageUrl = getEmptyPageUrl(server);

    browser = await puppeteer.launch({
      ...defaultBrowserOptions,
      args: [
        ...defaultArgs,
        `--proxy-server=${proxyServerUrl}`,
        `--proxy-bypass-list=${new URL(emptyPageUrl).host}`,
      ],
    });

    const page = await browser.newPage();
    const response = (await page.goto(emptyPageUrl))!;

    expect(response.ok()).toBe(true);

    expect(proxiedRequestUrls).toEqual([]);
  });

  describe('in incognito browser context', () => {
    it('should proxy requests when configured at browser level', async () => {
      const {puppeteer, defaultBrowserOptions, server} = getTestState();
      const emptyPageUrl = getEmptyPageUrl(server);

      browser = await puppeteer.launch({
        ...defaultBrowserOptions,
        args: [...defaultArgs, `--proxy-server=${proxyServerUrl}`],
      });

      const context = await browser.createIncognitoBrowserContext();
      const page = await context.newPage();
      const response = (await page.goto(emptyPageUrl))!;

      expect(response.ok()).toBe(true);

      expect(proxiedRequestUrls).toEqual([emptyPageUrl]);
    });

    it('should respect proxy bypass list when configured at browser level', async () => {
      const {puppeteer, defaultBrowserOptions, server} = getTestState();
      const emptyPageUrl = getEmptyPageUrl(server);

      browser = await puppeteer.launch({
        ...defaultBrowserOptions,
        args: [
          ...defaultArgs,
          `--proxy-server=${proxyServerUrl}`,
          `--proxy-bypass-list=${new URL(emptyPageUrl).host}`,
        ],
      });

      const context = await browser.createIncognitoBrowserContext();
      const page = await context.newPage();
      const response = (await page.goto(emptyPageUrl))!;

      expect(response.ok()).toBe(true);

      expect(proxiedRequestUrls).toEqual([]);
    });

    /**
     * See issues #7873, #7719, and #7698.
     */
    itFailsWindows(
      'should proxy requests when configured at context level',
      async () => {
        const {puppeteer, defaultBrowserOptions, server} = getTestState();
        const emptyPageUrl = getEmptyPageUrl(server);

        browser = await puppeteer.launch({
          ...defaultBrowserOptions,
          args: defaultArgs,
        });

        const context = await browser.createIncognitoBrowserContext({
          proxyServer: proxyServerUrl,
        });
        const page = await context.newPage();
        const response = (await page.goto(emptyPageUrl))!;

        expect(response.ok()).toBe(true);

        expect(proxiedRequestUrls).toEqual([emptyPageUrl]);
      }
    );

    it('should respect proxy bypass list when configured at context level', async () => {
      const {puppeteer, defaultBrowserOptions, server} = getTestState();
      const emptyPageUrl = getEmptyPageUrl(server);

      browser = await puppeteer.launch({
        ...defaultBrowserOptions,
        args: defaultArgs,
      });

      const context = await browser.createIncognitoBrowserContext({
        proxyServer: proxyServerUrl,
        proxyBypassList: [new URL(emptyPageUrl).host],
      });
      const page = await context.newPage();
      const response = (await page.goto(emptyPageUrl))!;

      expect(response.ok()).toBe(true);

      expect(proxiedRequestUrls).toEqual([]);
    });
  });
});
