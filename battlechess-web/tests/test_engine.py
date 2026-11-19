import pathlib, unittest, quickjs

class EngineTests(unittest.TestCase):
    def setUp(self):
        self.js = quickjs.Context()
        self.js.eval((pathlib.Path(__file__).resolve().parents[1] / 'engine.js').read_text(encoding='utf-8-sig'))
        self.js.eval('function perft(g,d){if(!d)return 1;let n=0;for(const m of g.legalMoves()){g.move(m.from,m.to,m.promotion);n+=perft(g,d-1);g.undo()}return n}')
    def test_perft(self):
        self.assertEqual(self.js.eval('perft(new ChessGame(),1)'),20)
        self.assertEqual(self.js.eval('perft(new ChessGame(),2)'),400)
        self.assertEqual(self.js.eval('perft(new ChessGame(),3)'),8902)
    def test_kiwipete(self):
        self.assertEqual(self.js.eval("perft(new ChessGame('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'),2)"),2039)
    def test_en_passant_pin(self):
        self.assertFalse(self.js.eval("new ChessGame('k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1').legalMoves(28).some(m=>m.to===19)"))
    def test_castling_through_attack(self):
        self.assertFalse(self.js.eval("new ChessGame('k4r2/8/8/8/8/8/8/4K2R w K - 0 1').legalMoves(60).some(m=>m.to===62)"))
    def test_underpromotion_undo(self):
        self.assertTrue(self.js.eval("(()=>{let g=new ChessGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'), f=g.fen();let r=g.move(8,0,'n');return r.promotion==='n'&&g.board[0]==='N'&&!!g.undo()&&g.fen()===f})()"))
    def test_mate_and_repetition(self):
        self.assertTrue(self.js.eval("(()=>{let g=new ChessGame();for(let [a,b] of [[53,45],[12,28],[54,38],[3,39]])g.move(a,b);return g.status().reason==='checkmate'&&g.history[3].san==='Qh4#'})()"))
        self.assertEqual(self.js.eval("(()=>{let g=new ChessGame();for(let i=0;i<2;i++)for(let [a,b] of [[62,45],[6,21],[45,62],[21,6]])g.move(a,b);return g.status().reason})()"),'threefold')

if __name__ == '__main__': unittest.main()
