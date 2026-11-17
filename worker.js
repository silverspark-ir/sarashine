export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ═══ robots.txt ═══
    if (path === '/robots.txt') {
      const robots = `User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml`;
      return new Response(robots, {
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' }
      });
    }

    // ═══ sitemap.xml ═══
    if (path === '/sitemap.xml') {
      try {
        const repoBase = 'https://api.github.com/repos/goldspark1/Goldspark.app/contents/';
        const headers = {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GoldsPark-Worker-Sitemap'
        };
        const jsonFiles = [
          'stamps-qajar.json', 'stamps-pahlavi1.json', 'stamps-pahlavi2.json',
          'stamps-international.json', 'stamps-coins.json', 'stamps-accessories.json',
          'stamps-gentlemen.json', 'stamps-jomhuri.json', 'stamps-postal.json'
        ];
        const decodeUTF8 = (b64) => {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new TextDecoder('utf-8').decode(bytes);
        };
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        xml += `  <url>\n    <loc>${url.origin}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
        const categories = ['qajar', 'pahlavi1', 'pahlavi2', 'international', 'coins', 'accessories', 'gentlemen', 'jomhuri', 'postal'];
        categories.forEach(cat => {
          xml += `  <url>\n    <loc>${url.origin}/${cat}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
        });
        await Promise.all(jsonFiles.map(async (file) => {
          try {
            const res = await fetch(repoBase + file, { headers });
            if (!res.ok) return;
            const data = await res.json();
            const items = JSON.parse(decodeUTF8(data.content));
            const type = file.replace('stamps-', '').replace('.json', '');
            const isJomhuri = type === 'jomhuri';
            items.forEach(item => {
              if (item.active === true && item.paymentVerified !== true && item.sellerSuspended !== true) {
                const itemId = item.id || '';
                const finalUrl = isJomhuri ? `${url.origin}/jomhuri/${itemId}` : `${url.origin}/${type}/${itemId}`;
                xml += `  <url>\n    <loc>${finalUrl}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
              }
            });
          } catch (e) {}
        }));
        xml += `</urlset>`;
        return new Response(xml, {
          headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' }
        });
      } catch (err) {
        return new Response('Error generating sitemap', { status: 500 });
      }
    }

    // ═══ API گیت‌هاب ═══
    if (path.startsWith('/api/github/')) {
      const ghPath = path.replace('/api/github/', '');
      if (!ghPath.startsWith('repos/goldspark1/Goldspark.app/contents/')) {
        return new Response('Forbidden path', { status: 403 });
      }
      const ghUrl = 'https://api.github.com/' + ghPath + url.search;
      const headers = new Headers(request.headers);
      headers.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`);
      headers.set('Accept', 'application/vnd.github.v3+json');
      headers.delete('Host');
      headers.delete('cf-connecting-ip');
      headers.delete('cf-ipcountry');
      headers.delete('x-forwarded-proto');
      headers.delete('cf-ray');
      headers.delete('cf-visitor');
      const ghRequest = new Request(ghUrl, {
        method: request.method,
        headers: headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
        redirect: 'follow',
      });
      try {
        const ghResponse = await fetch(ghRequest);
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };
        if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
        const newHeaders = new Headers(ghResponse.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(ghResponse.body, {
          status: ghResponse.status,
          statusText: ghResponse.statusText,
          headers: newHeaders,
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'GitHub API error: ' + err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // ═══ آپلود عکس ═══
    if (path === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        const fileName = formData.get('name');
        if (!file || !fileName) {
          return new Response(JSON.stringify({ error: 'فایل یا نام یافت نشد' }), { status: 400 });
        }
        const sizeKB = file.size / 1024;
        if (sizeKB < 30) {
          return new Response(JSON.stringify({ error: 'حجم فایل بسیار کم است.' }), { status: 400 });
        }
        if (sizeKB > 10240) {
          return new Response(JSON.stringify({ error: 'حجم فایل بیشتر از ۱۰ مگابایت است.' }), { status: 400 });
        }
        const buffer = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const ghUrl = `https://api.github.com/repos/goldspark1/Goldspark.app/contents/images/${fileName}`;
        const uploadRes = await fetch(ghUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'GoldsPark-Worker'
          },
          body: JSON.stringify({ message: 'Upload image', content: base64 })
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json();
          return new Response(JSON.stringify({ error: errData.message || 'خطا در گیت‌هاب' }), { status: 500 });
        }
        return new Response(JSON.stringify({ success: true, url: `https://goldspark.ir/images/${fileName}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // ═══ نمایش عکس‌ها ═══
    if (path.startsWith('/images/')) {
      const imageName = path.replace('/images/', '');
      const ghUrl = `https://api.github.com/repos/goldspark1/Goldspark.app/contents/images/${imageName}`;

      try {
        const ghResponse = await fetch(ghUrl, {
          headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GoldsPark-Worker'
          }
        });

        if (!ghResponse.ok) {
          return new Response('Not found: ' + ghResponse.status, { status: 404 });
        }

        const data = await ghResponse.json();

        if (!data.download_url) {
          return new Response('No download_url', { status: 500 });
        }

        const rawRes = await fetch(data.download_url);

        if (!rawRes.ok) {
          return new Response('Raw download failed: ' + rawRes.status, { status: 500 });
        }

        const ext = imageName.split('.').pop().toLowerCase();
        let contentType = 'image/jpeg';
        if (ext === 'png') contentType = 'image/png';
        else if (ext === 'webp') contentType = 'image/webp';
        else if (ext === 'gif') contentType = 'image/gif';
        else if (ext === 'svg') contentType = 'image/svg+xml';

        return new Response(rawRes.body, {
          status: 200,
          headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' }
        });
      } catch (err) {
        return new Response('Error: ' + err.message, { status: 500 });
      }
    }

    // ═══ SPA Fallback ═══
    const spaRegex = /^\/(qajar|pahlavi1|pahlavi2|international|coins|accessories|gentlemen|jomhuri|postal|auctions)(\/.*)?$/;
    if (spaRegex.test(path)) {
      try {
        const indexUrl = new URL('/', url.origin);
        const indexRequest = new Request(indexUrl.toString(), {
          method: request.method,
          headers: request.headers
        });
        const indexResponse = await env.ASSETS.fetch(indexRequest);
        const body = await indexResponse.text();
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      } catch (err) {
        return new Response('SPA Fallback error', { status: 500 });
      }
    }

    // ═══ بقیه ═══
    try {
      return await env.ASSETS.fetch(request);
    } catch (err) {
      return new Response('Not Found', { status: 404 });
    }
  },
};