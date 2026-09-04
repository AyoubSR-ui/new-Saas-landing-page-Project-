-- CreateEnum
CREATE TYPE "LandingPageStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "LandingPageStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPageProduct" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingPageProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingPage_shopId_idx" ON "LandingPage"("shopId");

-- CreateIndex
CREATE INDEX "LandingPage_shopId_deletedAt_idx" ON "LandingPage"("shopId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_shopId_slug_key" ON "LandingPage"("shopId", "slug");

-- CreateIndex
CREATE INDEX "LandingPageProduct_landingPageId_idx" ON "LandingPageProduct"("landingPageId");

-- CreateIndex
CREATE INDEX "LandingPageProduct_productId_idx" ON "LandingPageProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPageProduct_landingPageId_productId_key" ON "LandingPageProduct"("landingPageId", "productId");

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPageProduct" ADD CONSTRAINT "LandingPageProduct_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPageProduct" ADD CONSTRAINT "LandingPageProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

