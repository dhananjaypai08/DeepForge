#[test_only]
module deepforge::strategy_tests;

use deepforge::strategy::{Self, Strategy};
use std::string;
use sui::clock;
use sui::test_scenario as ts;

#[test]
fun publish_then_fork() {
    let author = @0xA;
    let mut sc = ts::begin(author);
    let clk = clock::create_for_testing(sc.ctx());

    // Publish a strategy (shares the object).
    let parent_id = strategy::publish(
        string::utf8(b"Range Harvest"),
        string::utf8(b"deadbeef"),
        string::utf8(b"walrus:blob123"),
        80, // risk score
        420_000_000, false, // best +$420
        170_000_000, false, // expected +$170
        95_000_000, true, // worst -$95
        &clk,
        sc.ctx(),
    );

    // Fork it in a later tx.
    sc.next_tx(author);
    let mut parent = sc.take_shared<Strategy>();
    assert!(strategy::forks(&parent) == 0, 0);
    assert!(strategy::parent(&parent).is_none(), 1);

    let child_id = strategy::fork(
        &mut parent,
        string::utf8(b"Range Harvest v2"),
        string::utf8(b"cafebabe"),
        string::utf8(b"walrus:blob456"),
        72,
        500_000_000, false,
        200_000_000, false,
        110_000_000, true,
        &clk,
        sc.ctx(),
    );
    assert!(strategy::forks(&parent) == 1, 2);
    assert!(child_id != parent_id, 3);
    ts::return_shared(parent);

    // The forked child records its parent.
    sc.next_tx(author);
    let child = ts::take_shared_by_id<Strategy>(&sc, child_id);
    let p = strategy::parent(&child);
    assert!(p.is_some(), 4);
    assert!(p.borrow() == &parent_id, 5);
    assert!(strategy::risk_score(&child) == 72, 6);
    ts::return_shared(child);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun record_execution_emits() {
    let author = @0xB;
    let mut sc = ts::begin(author);
    let clk = clock::create_for_testing(sc.ctx());
    let id = strategy::publish(
        string::utf8(b"S"),
        string::utf8(b"h"),
        string::utf8(b"b"),
        50,
        0, false,
        0, false,
        0, false,
        &clk,
        sc.ctx(),
    );
    assert!(id != @0x0.to_id(), 0);
    sc.next_tx(author);
    let s = sc.take_shared<Strategy>();
    strategy::record_execution(&s, string::utf8(b"0xdigest"), &clk, sc.ctx());
    ts::return_shared(s);
    clock::destroy_for_testing(clk);
    sc.end();
}
