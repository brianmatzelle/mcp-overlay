from pydantic import BaseModel


class EnrichmentRequest(BaseModel):
    trackId: int
    label: str
    confidence: float
    cropBase64: str


class Identification(BaseModel):
    name: str
    brand: str | None
    model: str | None
    color: str
    category: str
    description: str


class PriceEstimate(BaseModel):
    range_low: str
    range_high: str
    currency: str
    note: str


class Enrichment(BaseModel):
    summary: str
    price_estimate: PriceEstimate
    specs: dict[str, str]
    search_query: str


class EnrichmentResponse(BaseModel):
    trackId: int
    identification: Identification
    enrichment: Enrichment
