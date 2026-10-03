import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalog, listChapters } from '../src/catalog.js';
import { createSourceSession, loadReader } from '../src/source.js';
const html = `<link rel="canonical" href="https://truyen.moe/manga/45-test">
<script type="application/ld+json">{"@type":"ComicSeries","name":"Test","numberOfItems":2}</script>
<a href="/manga/45-test/chapters/1" data-chapter-id="986" data-chapter-number="1"></a>
<a href="/manga/45-test/chapters/1.5" data-chapter-id="987" data-chapter-number="1.5"></a>
<a href="/manga/45-test?chapterPage=7#chapters"></a>
<a href="https://evil.test/manga/45-test/chapters/9" data-chapter-id="9" data-chapter-number="9"></a>`;
test('catalog preserves decimal chapters, pagination and emits only own API URLs', () => {
    const data = parseCatalog(html, 45, 1, 'https://own.test');
    assert.equal(data.meta.pagination.totalPages, 7);
    assert.deepEqual(data.data.chapters.map(x=>x.number), [1.5,1]);
    assert.equal(data.data.chapters[1].pagesUrl, 'https://own.test/api/v1/manga/45/chapters/1/pages');
    assert.throws(()=>parseCatalog(html,46,1,'https://own.test'), {code:'catalog_format_changed'});
    assert.throws(()=>parseCatalog(html.replace(/<a[\s\S]*/,''),45,1,'https://own.test'), {code:'catalog_format_changed'});
});
test('catalog reads source HTML directly with chapterPage pagination', async()=> {
    const data = await listChapters(45,2,'https://own.test',async(url)=> {
        assert.equal(url,'https://truyen.moe/manga/45?chapterPage=2');
        return new Response(html);
    });
    assert.equal(data.data.manga.title,'Test');
});
test('reader follows canonical redirect while retaining source cookies and excluding ad media', async()=> {
    let calls=0;
    const reader=await loadReader(45,'1',async(url,options)=> {
        calls++;
        if(calls===1) return new Response(null,{status:302,headers:{Location:'/manga/45-test/chapters/1','Set-Cookie':'sid=test; Path=/'}});
        assert.equal(url,'https://truyen.moe/manga/45-test/chapters/1');
        assert.equal(options.headers.get('Cookie'),'sid=test');
        return new Response('chapterId: 986, bootstrapUrl: "/bootstrap", media: [{"pageIndex":58,"storageKey":"0.js"},{"pageIndex":0,"storageKey":"chapters/image.js"}],');
    });
    assert.equal(reader.chapterId,986);
    assert.deepEqual(reader.pages.map(x=>x.pageIndex),[0]);
    assert.equal(calls,2);
});
test('source refuses redirects to another origin without sending cookies there', async()=> {
    let calls=0;
    const session=createSourceSession(async()=> { calls++; return new Response(null,{status:302,headers:{Location:'https://evil.test/', 'Set-Cookie':'sid=secret'}}); });
    await assert.rejects(()=>session.document('https://truyen.moe/manga/45'),{code:'invalid_reader_origin'});
    assert.equal(calls,1);
});

test('paginated documents without JSON-LD use the actual heading and still detect missing chapters', ()=> {
    const paginated=html.replace(/<script[\s\S]*?<\/script>/, '<h1 class="manga-detail-title">Test &amp; title</h1>');
    assert.equal(parseCatalog(paginated,45,7,'https://own.test').data.manga.title,'Test & title');
    assert.throws(()=>parseCatalog(paginated.replace(/<a[\s\S]*/,''),45,7,'https://own.test'),{code:'catalog_format_changed'});
});
