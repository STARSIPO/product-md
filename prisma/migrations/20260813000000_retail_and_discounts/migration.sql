-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isRetail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "retailDeliveryFeeBani" INTEGER,
ADD COLUMN     "retailDeliveryNote" TEXT,
ADD COLUMN     "retailFreeFromBani" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "discountEndsAt" TIMESTAMP(3),
ADD COLUMN     "isRetail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "oldPriceBani" INTEGER,
ADD COLUMN     "retailMinQty" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "retailPriceBani" INTEGER;

-- CreateTable
CREATE TABLE "RetailOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerUserId" TEXT,
    "sellerCompanyId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryLocalityId" TEXT,
    "deliveryNote" TEXT,
    "deliveryAt" TIMESTAMP(3),
    "itemsTotalBani" INTEGER NOT NULL,
    "deliveryFeeBani" INTEGER NOT NULL DEFAULT 0,
    "totalBani" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MDL',
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "cancelReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "unitPriceBani" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "quantity" DOUBLE PRECISION NOT NULL,
    "totalBani" INTEGER NOT NULL,

    CONSTRAINT "RetailOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailOrder_number_key" ON "RetailOrder"("number");

-- CreateIndex
CREATE INDEX "RetailOrder_sellerCompanyId_status_createdAt_idx" ON "RetailOrder"("sellerCompanyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RetailOrder_customerUserId_createdAt_idx" ON "RetailOrder"("customerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailOrder_status_createdAt_idx" ON "RetailOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RetailOrderItem_orderId_idx" ON "RetailOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "RetailOrderItem_productId_idx" ON "RetailOrderItem"("productId");

-- CreateIndex
CREATE INDEX "Product_status_discountEndsAt_idx" ON "Product"("status", "discountEndsAt");

-- CreateIndex
CREATE INDEX "Product_status_isRetail_idx" ON "Product"("status", "isRetail");

-- AddForeignKey
ALTER TABLE "RetailOrder" ADD CONSTRAINT "RetailOrder_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOrder" ADD CONSTRAINT "RetailOrder_sellerCompanyId_fkey" FOREIGN KEY ("sellerCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOrder" ADD CONSTRAINT "RetailOrder_deliveryLocalityId_fkey" FOREIGN KEY ("deliveryLocalityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOrderItem" ADD CONSTRAINT "RetailOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RetailOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOrderItem" ADD CONSTRAINT "RetailOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

