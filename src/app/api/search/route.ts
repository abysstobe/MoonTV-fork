import { NextResponse } from 'next/server';

import { getApiSites, getCacheTime } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';

export const runtime = 'edge';

/**
 * [新增功能] 这是一个辅助函数，用于执行一次完整的搜索。
 * 增强的搜索逻辑会多次调用它。
 */
async function performSearch(query: string): Promise<SearchResult[]> {
  const apiSites = getApiSites();
  const searchPromises = apiSites.map((site) => searchFromApi(site, query));
  const results = await Promise.all(searchPromises);
  return results.flat();
}

/**
 * [核心修改] 这是带有增强搜索逻辑的主函数。
 * 它会按顺序尝试多种搜索方式，以提高成功率。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const originalQuery = searchParams.get('q');

  if (!originalQuery) {
    const cacheTime = getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}`,
        },
      }
    );
  }

  try {
    // --- 增强的搜索回退逻辑 ---

    // 1. 第一次搜索：使用用户输入的原始关键词
    console.info(`[Search] 1. Starting initial search for: "${originalQuery}"`);
    let finalResults = await performSearch(originalQuery);

    // 定义用于分割关键词的特殊字符
    // 下面这行是关键！我们恢复了正确的正则表达式，并用注释告诉编译器忽略这里的“错误”告警。
    // eslint-disable-next-line no-useless-escape
    const separatorRegex = /[ \.·:：～~—_@，,\[\]!！\-]/;

    // 2. 第二次搜索（回退 #1）：如果首次搜索无结果，且关键词中包含特殊字符，则尝试简化关键词
    if (finalResults.length === 0 && separatorRegex.test(originalQuery)) {
      const queryForFallback1 = originalQuery.split(separatorRegex)[0].trim();

      // 确保简化后的关键词有效且与原始的不同
      if (queryForFallback1 && queryForFallback1 !== originalQuery) {
        console.info(`[Search] 2. Fallback #1 (split by symbol): "${queryForFallback1}"`);
        finalResults = await performSearch(queryForFallback1);

        // 3. 第三次搜索（回退 #2）：如果第二次搜索仍无结果，且关键词中包含数字，则尝试移除数字
        const hasNumbersRegex = /\d/;
        if (
          finalResults.length === 0 &&
          hasNumbersRegex.test(queryForFallback1)
        ) {
          const queryForFallback2 = queryForFallback1.replace(/\d/g, '').trim();

          // 确保再次简化后的关键词有效
          if (queryForFallback2 && queryForFallback2 !== queryForFallback1) {
            console.info(`[Search] 3. Fallback #2 (remove numbers): "${queryForFallback2}"`);
            finalResults = await performSearch(queryForFallback2);
          }
        }
      }
    }

    const cacheTime = getCacheTime();
    return NextResponse.json(
      { results: finalResults },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}`,
        },
      }
    );
  } catch (error) {

    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
