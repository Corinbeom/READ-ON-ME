import { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'react-native';
import { findCatalogEdition } from '@/src/services/catalogEdition';
import { getIsbn13 } from '@/src/utils/bookUtils';
import { secureImageUri } from '@/src/utils/imageUri';

const defaultCover = require('../assets/mascot/bookmark_searching_books_light.png');

type CoverProps = Pick<ImageProps, 'style' | 'resizeMode'> & {
  uri?: string | null;
  lookupIsbn?: string;
};

export default function BookCover({ uri, lookupIsbn, ...props }: CoverProps) {
  const isbn = getIsbn13({ isbn: lookupIsbn });
  const image = secureImageUri(uri);
  return <EditionCover key={JSON.stringify([isbn, image])} uri={image} lookupIsbn={isbn} {...props} />;
}

function EditionCover({ uri, lookupIsbn, resizeMode = 'cover', style }: CoverProps) {
  const [failedOriginal, setFailedOriginal] = useState(false);
  const [catalogCover, setCatalogCover] = useState<string>();
  const original = failedOriginal ? undefined : uri;
  const remote = original || catalogCover;

  useEffect(() => {
    if (original || !lookupIsbn) return;
    const controller = new AbortController();
    findCatalogEdition(lookupIsbn, controller.signal).then(match => {
      if (controller.signal.aborted) return;
      const cover = secureImageUri(match?.thumbnail);
      if (cover && cover !== uri) setCatalogCover(cover);
    }).catch(() => { /* Keep the bundled cover when the catalog is unavailable. */ });
    return () => controller.abort();
  }, [original, lookupIsbn, uri]);

  return <Image key={remote || 'default'} source={remote ? { uri: remote } : defaultCover} style={style}
    resizeMode={resizeMode} accessible={false}
    onError={remote ? () => original ? setFailedOriginal(true) : setCatalogCover(undefined) : undefined} />;
}
