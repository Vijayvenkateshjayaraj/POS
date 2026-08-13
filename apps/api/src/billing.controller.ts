import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('api/v1/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('sessions')
  createSession(@Body() body: Record<string, unknown>) {
    return this.billing.createSession(body);
  }

  @Patch('sessions/:sessionId')
  transitionSession(@Param('sessionId') sessionId: string, @Body() body: Record<string, unknown>) {
    return this.billing.transitionSession(sessionId, body);
  }

  @Post('sessions/:sessionId/reservations')
  reserveStock(@Param('sessionId') sessionId: string, @Body() body: Record<string, unknown>) {
    return this.billing.reserveStock(sessionId, body);
  }

  @Post('sessions/:sessionId/complete')
  completeSession(@Param('sessionId') sessionId: string, @Body() body: Record<string, unknown>) {
    return this.billing.completeSession(sessionId, body);
  }

  @Post('sessions/:sessionId/payments')
  createPaymentAttempt(@Param('sessionId') sessionId: string, @Body() body: Record<string, unknown>) {
    return this.billing.createPaymentAttempt(sessionId, body);
  }

  @Post('sessions/:sessionId/overrides')
  recordOverride(@Param('sessionId') sessionId: string, @Body() body: Record<string, unknown>) {
    return this.billing.recordOverride(sessionId, body);
  }

  @Post('payments/webhook')
  paymentWebhook(@Body() body: Record<string, unknown>, @Headers('x-webhook-signature') signature?: string) {
    return this.billing.processPaymentWebhook(body, signature);
  }

  @Post('external-drafts')
  createExternalDraft(@Body() body: Record<string, unknown>) {
    return this.billing.createExternalDraft(body);
  }

  @Patch('external-drafts/:draftId/lines/:lineId')
  approveExternalLine(@Param('draftId') draftId: string, @Param('lineId') lineId: string, @Body() body: Record<string, unknown>) {
    return this.billing.approveExternalLine(draftId, lineId, body);
  }

  @Post('analytics')
  recordAnalytics(@Body() body: Record<string, unknown>) {
    return this.billing.recordAnalytics(body);
  }

  @Post('device-events')
  recordDeviceEvent(@Body() body: Record<string, unknown>) {
    return this.billing.recordDeviceEvent(body);
  }

  @Get('recovery')
  recovery(@Query('locationCode') locationCode?: string) {
    return this.billing.recovery(locationCode);
  }
}
