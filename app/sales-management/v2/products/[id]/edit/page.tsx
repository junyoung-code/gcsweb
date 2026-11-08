import ProductsPage from '@/components/sales-management/v2/products/ProductsPage';
export default function Page({ params }: { params: { id: string } }) { return <ProductsPage form productId={params.id} />; }
