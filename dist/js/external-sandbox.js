/** Connected test-money exits are distinct from a live MoMo/bank provider. */
export const externalRail=rail=>rail==='momo'||rail==='bank';
export const externalSandboxEnabled=ctx=>ctx.connected===true&&ctx.shared?.capabilities?.externalTransferSandbox===true;
export const isExternalSandboxTransfer=tx=>externalRail(tx?.rail)&&tx?.externalSimulation===true&&tx?.providerMode==='sandbox';
export const externalSimulationNotice='Test-money transfer only. Your Lumo test balance will decrease. No real money reaches this MoMo number or bank account.';
