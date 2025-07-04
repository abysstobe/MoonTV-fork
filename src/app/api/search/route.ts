import { NextResponse } from 'next/server';

import { ApiSite, getApiSites, getCacheTime } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { SearchResult } from '@/lib/types';

export const runtime = 'edge';

/**
 * 封装的搜索执行函数
 * @param query - 搜索关键词
 * @param apiSites - API 站点列表
 * @returns 扁平化的搜索结果数组
 */
async function performSearch(
  query: string,
  apiSites: ApiSite[]
): Promise<SearchResult[]> {
  // 如果关键词为空，直接返回空数组，避免无效请求
  if (!query || query.trim() === '') {
    return [];
  }
  const searchPromises = apiSites.map((site) => searchFromApi(site, query));
  const results = await Promise.all(searchPromises);
  return results.flat();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const originalQuery = searchParams.get('q');
  const cacheTime = getCacheTime();

  if (!originalQuery) {
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}`,
        },
      }
    );
  }

  const apiSites = getApiSites();

  try {
    // 第一次搜索：使用原始关键词
    let finalResults = await performSearch(originalQuery, apiSites);

    // --- 搜索回退逻辑开始 ---

    // 条件：第一次搜索结果为空
    if (finalResults.length === 0) {
      // 【修正】移除了正则表达式中不必要的转义字符，修复 ESLint 错误
      // eslint-disable-next-line no-useless-escape
      const specialCharRegex = /[\s.·:：～~—_@，,\[\]!！-]/;

      // 条件：原始关键词包含特殊符号
      if (specialCharRegex.test(originalQuery)) {
        // 简化关键词，只取第一个特殊符号前的内容
        const simplifiedQuery = originalQuery.split(specialCharRegex)[0];

        // 确保简化后的关键词有效且与原始词不同
        if (simplifiedQuery && simplifiedQuery !== originalQuery) {
          // 第二次搜索：使用简化后的关键词
          finalResults = await performSearch(simplifiedQuery, apiSites);

          // 条件：第二次搜索结果仍为空
          if (finalResults.length === 0) {
            const digitRegex = /\d/;
            // 条件：简化后的关键词包含数字
            if (digitRegex.test(simplifiedQuery)) {
              // 去除所有数字
              const digitlessQuery = simplifiedQuery.replace(/\d/g, '');

              // 确保去除数字后关键词仍有效
              if (digitlessQuery) {
                // 第三次搜索：使用去除数字后的关键词
                finalResults = await performSearch(digitlessQuery, apiSites);
              }
            }
          }
        }
      }
    }
    // --- 搜索回退逻辑结束 ---

    return NextResponse.json(
      { results: finalResults },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}`,
        },
      }
    );
  } catch (error) {
    // 【修正】移除了不必要的 console.log
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
