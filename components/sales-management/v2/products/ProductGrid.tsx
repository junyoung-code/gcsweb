import Image from 'next/image';
import Link from 'next/link';
import Button from '@/components/ui/button/Button';
import Tag from '@/components/ui/common/Tag';
import type { SalesProduct } from '@/types/sales-management';
import { productAssets, productsPath } from './ProductsShell';
import styles from './products.module.css';
import { truncate } from '../truncate';

export default function ProductGrid({ products, newestProductId, onDelete }: {
  products: SalesProduct[]; newestProductId?: string | null; onDelete: (product: SalesProduct) => void;
}) {
  return <ul className={styles.grid} aria-label="상품 목록">
    {products.map(product => <li key={product.id} className={styles.card}>
      <div className={`${styles.photo} ${!product.imageUrl ? styles.placeholder : ''}`}>
        {product.imageUrl ? <Image src={product.imageUrl} alt={product.name}
          width={210} height={210} unoptimized className={product.imageUrl === `${productAssets}/bag.png` ? styles.bagImage : styles.productImage} />
          : <span role="img" aria-label="상품 이미지 없음" />}
      </div>
      <div className={styles.cardInfo}>
        <div className={styles.cardName}>
          {newestProductId === product.id && <span className={styles.newTag}>NEW</span>}
          {product.category && <Tag contents={product.category} className={styles.tag} />}
          <h2 title={product.name}>{truncate(product.name, 20)}</h2>
        </div>
        <p className={styles.price}>{product.price.toLocaleString('ko-KR')}원</p>
        <div className={styles.inventory}>
          {product.options.length > 0 && <p title={product.options.map(option => `${option.name}(${option.stock.toLocaleString('ko-KR')})`).join(', ')}>{truncate(product.options.map(option => `${option.name}(${option.stock.toLocaleString('ko-KR')})`).join(', '), 20)}</p>}
          <p>총재고 {product.stock.toLocaleString('ko-KR')}개</p>
        </div>
        <div className={styles.cardActions}>
          <Link href={`${productsPath}/${product.id}/edit`} aria-label={`${product.name} 수정`}>수정</Link>
          {!product.hasSalesHistory && <Button color="white" size="s" onClick={() => onDelete(product)} aria-label={`${product.name} 삭제`}>삭제</Button>}
        </div>
      </div>
    </li>)}
  </ul>;
}
