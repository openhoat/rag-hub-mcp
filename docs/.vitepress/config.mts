import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'rag-hub-mcp',
    description: 'Self-hosted RAG that speaks MCP',
    base: '/rag-hub-mcp/',

    head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/rag-hub-mcp/logo.svg' }]],

    themeConfig: {
      logo: '/logo.svg',

      nav: [
        { text: 'Getting Started', link: '/guide/getting-started' },
        { text: 'Architecture', link: '/guide/architecture' },
        { text: 'MCP Tools', link: '/guide/mcp-tools' },
        { text: 'REST API', link: '/guide/rest-api' },
        { text: 'Configuration', link: '/guide/configuration' },
        { text: 'Contributing', link: '/guide/contributing' },
      ],

      sidebar: [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Architecture', link: '/guide/architecture' },
            { text: 'MCP Tools', link: '/guide/mcp-tools' },
            { text: 'REST API', link: '/guide/rest-api' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Integrations', link: '/guide/integrations' },
            { text: 'End-to-end example', link: '/guide/end-to-end' },
            { text: 'Contributing', link: '/guide/contributing' },
          ],
        },
      ],

      socialLinks: [{ icon: 'github', link: 'https://github.com/openhoat/rag-hub-mcp' }],

      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright © 2026 Olivier Penhoat',
      },

      editLink: {
        pattern: 'https://github.com/openhoat/rag-hub-mcp/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },

      search: {
        provider: 'local',
      },
    },
  })
)
