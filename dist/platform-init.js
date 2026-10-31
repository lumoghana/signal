/* Installed after all controllers. View controls never replace engine checks. */
(()=>{
if(!window.L?.platform)return;
L.platform.registerMoneyActions([
 'L.authorizePayment','L.biometricPayment.approve','L.settlePayment','L.refundPayment',
 'L.requestMomoFunding','L.fundingOutcome','L.fundingApproved',
 'L.simulateBankReceipt','L.testBankCredit','L.simRequestCredit','L.simulateSharedReceipt',
 'L.gm.recordSample','L.gm.refund','L.gm.cancel','L.gm.createProposal',
 'L.gm.approveOwn','L.gm.approveMember','L.gm.declineProposal','L.gm.withdrawProposal',
 'L.gm.releasePayout','L.gm.checkPayoutStatus','L.gm.acceptInvitation',
 'L.virtualCardUI.approve','L.virtualCardUI.simulatePurchase','L.virtualCardUI.resolveIssue',
 'L.virtualCardUI.resolveTransaction','L.virtualCardUI.simulateRefund','L.virtualCardUI.requestLifecycle',
 'L.confirmAllocation','L.confirmRelease'
]);
L.platform.registerShell();
L.platform.sync();
})();
