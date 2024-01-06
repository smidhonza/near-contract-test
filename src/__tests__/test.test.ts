import {Worker, NEAR} from 'near-workspaces';

describe('Proof of concept', () => {
    let worker: Worker;

    beforeEach(async () => {
        worker = await Worker.init();
    });
    afterEach(async () => {
        worker && await worker.tearDown();
    })

    it('could work', async () => {
        const root = worker.rootAccount;

        const contract = await root.devDeploy(
            './build/contract.wasm',
            {initialBalance: NEAR.parse('30 N').toJSON()},
        );

        const result = await contract.view('get_hi', {account_id: root.accountId});
        expect(result).toEqual("Hi");
    })
})
