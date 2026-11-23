// The reviewed import stores the institution and source URL on a final credit line.
// Leave ordinary descriptions intact, including any unrecognized source text.
export function readBookAttribution(contents?: string | null) {
  const description = contents ?? '';
  const credit = /\n\n출처: ([^\n]+) (https:\/\/[^\s]+)\s*$/.exec(description);
  if (credit) {
    const [, label, href] = credit;
    const press = label.startsWith('국립중앙도서관 사서추천도서 보도자료, ') &&
      /^https:\/\/www\.nl\.go\.kr\/NL\/contents\/N50603000000\.do\?schM=view&id=\d+$/.test(href);
    const library = label.startsWith('국립어린이청소년도서관 사서추천도서, ') &&
      href === 'https://www.data.go.kr/data/15151124/fileData.do';
    if (press || library) {
      return { description: description.slice(0, credit.index), source: { label, href: href as `https://${string}` } };
    }
  }
  return { description, source: null };
}
