// Lá quẻ Vận Hạn & Xuất Hành — lời khuyên của vị Sư Thầy ở chân dung portrait_6, Điện Tăng Đoàn.
// 48 lá, 8 chủ đề × 6 lá: Tam Tai, Kim Lâu, Hoang Ốc, Thái Tuế, Giải hạn, Xuất ngoại · Du học, Định cư,
// Chuyển nhà · Xây nhà. Giọng Sư Thầy hiền hậu, hơi hóm, xưng “con” với khách. Tín ngưỡng dân gian (Tam Tai theo nhóm
// tam hợp, Kim Lâu theo tuổi mụ, vòng sáu cung Hoang Ốc, năm tuổi / xung Thái Tuế, mượn tuổi, dâng sao đầu năm) chỉ
// được kể lại một cách tôn trọng; trọng tâm là sống lành, cẩn trọng và chuẩn bị thực tế (giấy tờ, bảo hiểm, ngân sách,
// đi lại an toàn). Không dọa hạn, không khuyên lễ lạt tốn kém; mức Trung Bình chỉ là lời nhắc giữ mình.
import type { FortuneSlip } from './domains';

/** Lá quẻ Vận Hạn & Xuất Hành (8 chủ đề × 6 lá). */
export const VAN_HAN: readonly FortuneSlip[] = [
  // ── Tam Tai ──
  {
    level: 'Đại Cát',
    topic: 'Tam Tai',
    title: 'Mây tan trời quang',
    verse: ['Trời quang mây tạnh sáng ngời', 'Ba năm hạn cũng nhẹ rơi như sương'],
    advice: 'Quẻ đại cát: dù dân gian có tính năm nay là năm Tam Tai của con thì hạn cũng nhẹ như sương sớm. Tam Tai là ba năm liền trong mỗi vòng mười hai năm, tính theo nhóm tam hợp, ví như tuổi Thân, Tý, Thìn gặp Tam Tai vào các năm Dần, Mão, Thìn. Cứ làm việc thiện, giữ sức khỏe, việc lớn tính kỹ là bình an.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Tam Tai',
    title: 'Thuyền neo chờ gió thuận',
    verse: ['Thuyền neo bến cũ chờ thời', 'Gió lên giương cánh buồm khơi xa bờ'],
    advice: 'Năm hạn theo dân gian không phải năm xấu, chỉ là năm nên đi chậm mà chắc. Việc lớn như đổi việc, đầu tư, mua bán nhà thì lập kế hoạch kỹ, hỏi ý người có kinh nghiệm, chuẩn bị phương án dự phòng. Giữ sức, giữ tiền, giữ lời, gió thuận rồi sẽ tới.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Tam Tai',
    title: 'Gáo nước mát ven đường',
    verse: ['Làm lành hạn cũng hóa lành', 'Gieo nhân tử tế trĩu cành quả thơm'],
    advice: 'Ông bà xưa dạy năm hạn càng nên sống lành làm thiện, đó cũng là cách giải hạn bền nhất. Mỗi tháng làm một việc tốt cụ thể: hiến máu, góp quỹ từ thiện tin cậy, giúp hàng xóm lớn tuổi một việc nặng. Tâm an thì hạn có đến cũng hóa nhẹ.',
  },
  {
    level: 'Trung Cát',
    topic: 'Tam Tai',
    title: 'Chậm bánh xe đầu dốc',
    verse: ['Đường trơn đi chậm mà hay', 'Mũ bền dây chắc vững tay lái về'],
    advice: 'Dân gian dặn năm Tam Tai nên cẩn thận chuyện đi lại, lời dặn ấy hợp cả với lẽ an toàn. Bảo dưỡng xe định kỳ, đội mũ bảo hiểm đạt chuẩn, không lái xe khi đã uống rượu bia hay đang buồn ngủ. Mua bảo hiểm cho xe và cho bản thân, tốn ít mà lòng nhẹ nhiều.',
  },
  {
    level: 'Tiểu Cát',
    topic: 'Tam Tai',
    title: 'Hũ gạo đầy góc bếp',
    verse: ['Của tiền giữ lấy đôi phần', 'Phòng khi mưa gió khỏi cần chạy lo'],
    advice: 'Tiền bạc năm Tam Tai nên giữ chặt hơn là tiêu mạnh tay. Lập quỹ dự phòng đủ vài tháng chi tiêu, hạn chế đứng ra bảo lãnh hay cho vay khoản lớn. Ai rủ làm ăn “lời chắc” thì cứ từ chối nhẹ nhàng, chậm một năm cũng chẳng sao.',
  },
  {
    level: 'Trung Bình',
    topic: 'Tam Tai',
    title: 'Hạt cát chẳng thành núi',
    verse: ['Hạn về chớ vội lo nhiều', 'Ăn chừng ngủ đủ sớm chiều thong dong'],
    advice: 'Lo nghĩ quá mức về hạn hành mới chính là cái hạn lớn nhất của con lúc này. Giữ nếp ngủ đủ, ăn uống điều độ, đi khám sức khỏe định kỳ cho yên tâm. Việc gì chưa chắc thì hoãn lại, việc gì đã chắc thì cứ làm.',
  },

  // ── Kim Lâu ──
  {
    level: 'Đại Cát',
    topic: 'Kim Lâu',
    title: 'Trầu têm cánh phượng',
    verse: ['Cưới xin gặp tuổi thuận hòa', 'Đôi bên nội ngoại như hoa đầu mùa'],
    advice: 'Việc cưới hỏi đang thuận, hai họ vui vẻ. Dân gian xét Kim Lâu theo tuổi mụ, thường là tuổi cô dâu: lấy tuổi mụ chia cho 9, dư 1, 3, 6 hoặc 8 thì gọi là phạm. Gặp năm không phạm thì cứ yên tâm, mà quan trọng hơn cả là hai con đã thật lòng hiểu nhau và cùng chuẩn bị kỹ.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Kim Lâu',
    title: 'Ngón tay bấm đốt',
    verse: ['Ngồi đây bấm đốt mà xem', 'Tuổi âm năm ấy rồi đem chín chia'],
    advice: 'Muốn xem Kim Lâu cho chuẩn thì tính tuổi mụ: lấy năm âm lịch định làm việc trừ năm sinh âm lịch rồi cộng thêm một. Đem số ấy chia cho 9, dư 1, 3, 6 hoặc 8 thì dân gian gọi là phạm, còn lại là không phạm. Biết cách tính là nắm phần chủ động, đừng để con số làm mình lo quá.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Kim Lâu',
    title: 'Mượn tuổi người lành',
    verse: ['Tuổi mình chưa hợp chớ phiền', 'Mượn người tuổi đẹp bình yên dựng nhà'],
    advice: 'Nếu tuổi gia chủ phạm Kim Lâu mà việc làm nhà không chờ được, dân gian có cách “mượn tuổi”: nhờ một người hợp tuổi đứng ra làm lễ động thổ thay mình. Chọn người thân tín, nói chuyện rõ ràng, giấy tờ nhà đất vẫn đứng tên con như bình thường. Quan trọng hơn cả là chọn nhà thầu uy tín và ký hợp đồng chặt chẽ.',
  },
  {
    level: 'Trung Cát',
    topic: 'Kim Lâu',
    title: 'Chỉ đỏ buộc cổ tay',
    verse: ['Kim Lâu chưa thuận năm này', 'Lòng son giữ trọn đợi ngày tốt tươi'],
    advice: 'Tuổi cô dâu năm nay nếu theo dân gian phạm Kim Lâu thì hai nhà có thể cùng bàn: chờ sang năm, hoặc vẫn cưới sau khi đã hỏi ý các bậc cao niên trong họ. Đừng để chuyện ngày tháng thành cớ giận hờn giữa hai bên. Tình đã bền thì đợi một mùa cũng không phai, mà cưới trong êm ấm cũng là phúc.',
  },
  {
    level: 'Tiểu Cát',
    topic: 'Kim Lâu',
    title: 'Giàn hoa giấy cổng cưới',
    verse: ['Cưới hay chẳng cốt cỗ đầy', 'Vừa tay vừa sức sum vầy mới vui'],
    advice: 'Gặp năm tuổi cô dâu không phạm Kim Lâu, hai họ mừng quá nên dễ muốn làm thật to cho xứng ngày đẹp. Đừng tính trước tiền mừng cưới để bù tiền tiệc, cũng đừng vay mượn để lo cỗ cho bằng nhà người. Ngày đã lành thì một cổng hoa giấy nhà tự kết, vài mâm cơm ấm đủ mặt người thân cũng thành đám cưới đẹp.',
  },
  {
    level: 'Trung Bình',
    topic: 'Kim Lâu',
    title: 'Nền móng chưa khô vữa',
    verse: ['Dựng nhà chưa vội năm nay', 'Giấy tờ bản vẽ lo ngay cho tròn'],
    advice: 'Còn đắn đo vì tuổi gia chủ năm nay phạm Kim Lâu thì cứ dùng năm này để chuẩn bị cho thật kỹ. Xin giấy phép xây dựng, chốt bản vẽ, so sánh vài nhà thầu, dồn đủ tiền để khỏi đang xây phải dừng. Chuẩn bị chắc thì sang năm khởi công nhanh mà nhẹ lòng.',
  },

  // ── Hoang Ốc ──
  {
    level: 'Đại Cát',
    topic: 'Hoang Ốc',
    title: 'Mái ngói đỏ đón nắng',
    verse: ['Cung lành đếm tới Tấn Tài', 'Mái cao cột vững lâu dài an vui'],
    advice: 'Cung Hoang Ốc năm nay báo tin vui: theo cách đếm của dân gian, tuổi rơi vào Nhất Cát hay Tứ Tấn Tài là cung đẹp để làm nhà. Thuận thì cứ khởi công, nhưng vẫn chọn nhà thầu đàng hoàng, giám sát vật liệu, ghi chép chi tiêu từng đợt. Nhà vững nhờ móng chắc và nhờ người ở trong ấy hòa thuận.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Hoang Ốc',
    title: 'Bánh xe sáu nan',
    verse: ['Sáu cung Hoang Ốc xoay vòng', 'Biết cung tránh hạn thì trong lòng an'],
    advice: 'Dân gian đếm Hoang Ốc theo vòng sáu cung: Nhất Cát, Nhì Nghi, Tam Địa Sát, Tứ Tấn Tài, Ngũ Thọ Tử, Lục Hoang Ốc; cung thứ ba, thứ năm và thứ sáu thường được tránh khi làm nhà. Muốn đếm cho đúng thì nhờ người am hiểu xem giúp theo tuổi mụ của gia chủ. Biết trước để chủ động lịch xây, không phải để lo âu.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Hoang Ốc',
    title: 'Viên đá tảng kê cột',
    verse: ['Nhì Nghi cung đẹp dựng nhà', 'Thợ ngay vật liệu thật thà mới bền'],
    advice: 'Quẻ này ứng cung Nhì Nghi, cung thứ hai trong vòng Hoang Ốc, được dân gian xem là hợp để dựng nhà. Cung đã thuận thì phần còn lại nằm ở người: chọn nhà thầu có giấy phép và có công trình cũ để con xem tận mắt, hợp đồng ghi rõ vật liệu, tiến độ, bảo hành. Trả tiền theo từng đợt nghiệm thu, đừng ứng hết một lần chỉ vì nể lời hứa ngọt.',
  },
  {
    level: 'Trung Cát',
    topic: 'Hoang Ốc',
    title: 'Giếng trời rọi nắng',
    verse: ['Nhà xinh đâu cốt tường cao', 'Nắng trong gió mát lối vào thênh thang'],
    advice: 'Lá số năm nay chẳng khen cũng chẳng chê cung Hoang Ốc của con, nghĩa là việc nhà cửa nằm trong tay con nhiều hơn. Dồn sức cho bản vẽ, nhờ kiến trúc sư tính hướng nắng, đường gió, chỗ thoát nước và lối thoát hiểm khi có sự cố. Nhà sáng sủa, thông thoáng, an toàn cho người ở mới là nhà hợp tuổi lâu bền.',
  },
  {
    level: 'Tiểu Cát',
    topic: 'Hoang Ốc',
    title: 'Mạch vữa mới trên tường cũ',
    verse: ['Xây to để đó năm sau', 'Đường dây ống nước sửa mau cho lành'],
    advice: 'Cung Hoang Ốc năm nay chưa phải cung đẹp nhất để xây mới, nhưng những chỗ hỏng có thể gây nguy hiểm thì nên sửa sớm. Nhờ thợ có tay nghề kiểm tra đường điện cũ, vết nứt tường, chỗ thấm dột và ống nước; việc nào liên quan đến an toàn làm trước, việc làm đẹp để sau. Nhà cũ mà an toàn vẫn ấm hơn nhà mới làm vội.',
  },
  {
    level: 'Trung Bình',
    topic: 'Hoang Ốc',
    title: 'Đất mềm cần cọc sâu',
    verse: ['Đất mềm cọc phải đóng sâu', 'Xem nền cho kỹ nhà lâu vững vàng'],
    advice: 'Theo vòng Hoang Ốc, quẻ ứng cung Tam Địa Sát, cung thứ ba mà dân gian dặn nên tránh khi khởi công, nên việc chưa gấp thì cứ thong thả lùi lại. Nếu buộc phải làm, hãy cẩn trọng phần đất: thuê đơn vị khảo sát nền móng, chụp ảnh hiện trạng nhà hàng xóm trước khi đào, che chắn công trình cho người qua lại. Đất vững thì nhà vững, xóm giềng êm thì lòng mình cũng yên.',
  },

  // ── Thái Tuế ──
  {
    level: 'Đại Cát',
    topic: 'Thái Tuế',
    title: 'Nụ đào đúng hẹn',
    verse: ['Gặp năm tuổi vẫn hanh thông', 'Nụ đào đúng hẹn trổ bông đầu mùa'],
    advice: 'Năm tuổi mà bóc được quẻ này thì cứ mỉm cười mà đi: dân gian gọi năm tuổi là năm gặp Thái Tuế, nhưng vận con vẫn hanh thông, lại có quý nhân nâng đỡ. Hãy xem năm tuổi như một cột mốc, nhìn lại mười hai năm đã qua, viết ra ba điều muốn làm tốt hơn và nói lời cảm ơn với những người từng giúp mình. Đầu năm đi chùa thắp nén hương, giữ lòng biết ơn, vậy là đủ đầy.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Thái Tuế',
    title: 'Cành liễu nghiêng theo gió',
    verse: ['Liễu mềm gió thổi chẳng sờn', 'Nhường nhau một bước còn hơn tranh giành'],
    advice: 'Gặp năm xung Thái Tuế, tức năm của con giáp đối diện tuổi mình như tuổi Tý gặp năm Ngọ, dân gian khuyên nên mềm mỏng như cành liễu trước gió. Quẻ thượng cát cho thấy chỉ cần nhường một câu trong tranh luận, đọc kỹ giấy tờ trước khi ký, mọi việc sẽ trôi chảy. Cái “xung” lớn nhất thường nằm ở cái tôi, hạ nó xuống một chút là hạn tự lui.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Thái Tuế',
    title: 'Ván cờ tính trước ba nước',
    verse: ['Cờ hay tính trước vài đường', 'Gặp năm Thái Tuế liệu lường mới đi'],
    advice: 'Ván cờ năm nay vẫn nghiêng về phía con, miễn là đi chậm mà chắc. Gặp quyết định lớn như đổi việc, mua nhà hay hùn vốn làm ăn, hãy viết lợi và hại ra hai cột, hỏi ý một người từng trải rồi ngủ thêm một giấc hẵng trả lời. Năm Thái Tuế không cấm con làm việc lớn, chỉ nhắc con tính trước vài nước.',
  },
  {
    level: 'Trung Cát',
    topic: 'Thái Tuế',
    title: 'Hơi thở giữa phố đông',
    verse: ['Phố đông xe chạy ồn ào', 'Thở sâu một nhịp lòng nào chẳng an'],
    advice: 'Đổi thay có thể đến bất chợt trong năm Thái Tuế, lúc đổi chỗ làm, lúc đổi nếp sinh hoạt, vì thế dân gian vẫn dặn năm này nên giữ mình. Gặp chuyện gấp, hãy dừng lại thở chậm ba hơi rồi mới nói, mới quyết; việc lớn thì đổi từng bước, mỗi lần một việc, và giữ lại vài nếp quen như bữa cơm nhà hay buổi đi bộ chiều làm chỗ tựa. Tâm vững như cột nhà thì gió có đổi chiều cũng chẳng xô ngã được.',
  },
  {
    level: 'Tiểu Cát',
    topic: 'Thái Tuế',
    title: 'Giữ miệng như giữ bình',
    verse: ['Lời ra chẳng thể thu về', 'Năm xung bớt nói khỏi chê khỏi phiền'],
    advice: 'Vận năm nay có chút lộc nhỏ, nhưng dễ vướng thị phi từ lời ăn tiếng nói. Bớt bình luận chuyện người khác trên mạng, góp ý thì nói riêng và nói nhẹ, chuyện bực mình thì đợi nguôi rồi hẵng nhắn tin. Người xưa dạy giữ miệng như giữ bình, khẩu nghiệp nhẹ thì lòng cũng nhẹ, hạn có đến cũng hóa nhỏ.',
  },
  {
    level: 'Trung Bình',
    topic: 'Thái Tuế',
    title: 'Nén hương thơm hơn mâm cỗ',
    verse: ['Lễ to chưa chắc đã linh', 'Nén nhang thành kính lòng mình thảnh thơi'],
    advice: 'Sẽ có người mách con phải làm lễ thật to mới qua được năm tuổi, con cứ cảm ơn rồi nhẹ nhàng từ chối. Đi chùa thắp nén hương, công đức tùy tâm trong sức mình, đừng vay mượn hay bán đồ để lo lễ. Phật chẳng cần mâm cao cỗ đầy, chỉ mong con sống tử tế và cẩn trọng mỗi ngày.',
  },

  // ── Giải hạn ──
  {
    level: 'Đại Cát',
    topic: 'Giải hạn',
    title: 'Hoa đăng lặng trôi sông',
    verse: ['Hoa đăng trôi giữa dòng êm', 'Hạn xưa đã nhẹ phúc thêm mỗi ngày'],
    advice: 'Hạn cũ đã trôi xa như ngọn hoa đăng xuôi dòng, năm nay con được hưởng quả lành từ những việc tử tế đã gieo. Giải hạn bền nhất vẫn là sống lành, làm thiện và cẩn trọng, mà con thì đang đi đúng con đường ấy. Cứ giữ thói quen tốt, thỉnh thoảng rủ thêm bạn bè cùng làm một việc thiện cho vui.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Giải hạn',
    title: 'Sao Mai mọc sớm',
    verse: ['Đầu năm thắp nén hương trầm', 'Lễ dâng đơn giản tùy tâm là lành'],
    advice: 'Dân gian có lệ dâng sao giải hạn vào dịp đầu năm; nếu đi lễ giúp con an lòng thì cứ đi, hương hoa quả đơn sơ, công đức tùy tâm là đủ. Quẻ báo vận con năm nay khá hiền, chẳng cần lễ lạt cầu kỳ hay tốn kém. Về nhà rồi, chọn một việc thiện nhỏ để làm đều đặn mỗi tháng, đó mới là phần giải hạn bền lâu.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Giải hạn',
    title: 'Băng tan dưới nắng xuân',
    verse: ['Oán xưa buông xuống nhẹ lòng', 'Như băng gặp nắng tan trong sớm mai'],
    advice: 'Có những cái hạn chẳng nằm trên lá số mà nằm ngay trong lòng, như một mối giận cũ con ôm mãi chưa buông. Nếu thấy an toàn và phù hợp, thử nhắn một lời làm hòa; còn không, chỉ cần viết những điều nặng lòng ra giấy rồi xé bỏ, tự nhủ mình buông. Buông được rồi, con sẽ thấy vận mình nhẹ hẳn, đó là giải hạn từ gốc.',
  },
  {
    level: 'Trung Cát',
    topic: 'Giải hạn',
    title: 'Chìa khóa dự phòng',
    verse: ['Phòng xa trước lúc gió mưa', 'Giấy tờ bảo hiểm cất vừa tầm tay'],
    advice: 'Lối giải hạn chắc chắn nhất là chuẩn bị từ trước, khỏi phải chạy theo sau. Dành một buổi cuối tuần chụp lưu giấy tờ quan trọng, xem lại hạn bảo hiểm, ghi số điện thoại khẩn cấp và gửi một chiếc chìa khóa dự phòng cho người thân tin cậy. Việc nhỏ hôm nay đỡ cho con cả một mùa lo lắng.',
  },
  {
    level: 'Trung Cát',
    topic: 'Giải hạn',
    title: 'Bát cháo nóng chiều đông',
    verse: ['Cho đi bát cháo đêm đông', 'Người no bụng kẻ vun trồng phúc sâu'],
    advice: 'Bố thí là cách giải hạn hiền lành mà ông bà ta vẫn tin, vì gieo nhân lành thì gặt quả lành. Làm thiện vừa sức mình thôi: góp vài suất cơm cho bếp ăn từ thiện, giúp một cụ già qua đường, quyên góp qua nơi minh bạch có công khai thu chi. Đừng vay mượn để làm phúc, cũng đừng làm để khoe, lòng nhẹ mới là phúc thật.',
  },
  {
    level: 'Trung Bình',
    topic: 'Giải hạn',
    title: 'Vấp hòn đá nhỏ đầu ngõ',
    verse: ['Vấp chân hòn đá đầu thôn', 'Lần sau đi chậm cho khôn mấy phần'],
    advice: 'Mấy chuyện xui nho nhỏ gần đây như rơi đồ, quên hẹn, va quẹt xe chưa hẳn là hạn, nhiều khi chỉ là cái thân đang mệt và cái đầu đang vội. Hãy chậm lại một nhịp: ngủ đủ giấc, ghi việc cần làm vào sổ, trước khi ra khỏi nhà kiểm tra ví, giấy tờ và điện thoại. Cẩn trọng từng việc nhỏ chính là lễ giải hạn chẳng tốn đồng nào.',
  },

  // ── Xuất ngoại · Du học ──
  {
    level: 'Đại Cát',
    topic: 'Xuất ngoại · Du học',
    title: 'Con tem mới trên hộ chiếu',
    verse: ['Trời xa đón bước chân con', 'Học hành thành đạt vuông tròn mai sau'],
    advice: 'Cánh cửa đi xa đang mở rộng: hồ sơ du học hay công tác nước ngoài của con gặp nhiều thuận lợi, nơi đất khách lại có quý nhân chờ sẵn. Khai hồ sơ trung thực, chuẩn bị đủ giấy tờ chứng minh tài chính và nộp sớm để còn thời gian bổ sung. Sang bên ấy nhớ giữ liên lạc với gia đình, tìm hội sinh viên hay cộng đồng người Việt để có chỗ dựa những ngày đầu.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Xuất ngoại · Du học',
    title: 'Cuốn từ điển sờn gáy',
    verse: ['Ngày ngày trau chữ nước ngoài', 'Sang rồi chẳng phải ngồi hoài lặng thinh'],
    advice: 'Đường xuất ngoại đã mở, chỉ chờ con chuẩn bị cho chín. Mỗi ngày dành ba mươi phút học ngoại ngữ, tập nói với người thật chứ đừng chỉ học thuộc, và tìm hiểu trước luật lệ, phong tục nơi sắp đến. Thạo tiếng thì bớt cô đơn, hiểu luật thì bớt rủi ro, vậy là đã nắm nửa phần may.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Xuất ngoại · Du học',
    title: 'Trăng quê theo bước người đi',
    verse: ['Đi xa làm lụng kiếm tiền', 'Giấy tờ đúng luật mới yên mẹ cha'],
    advice: 'Ý định đi làm việc ở nước ngoài năm nay gặp cơ hội tốt, nhất là khi con có tay nghề và chịu khó. Chỉ đi qua doanh nghiệp được cấp phép đưa người lao động ra nước ngoài, đọc kỹ hợp đồng về lương, giờ làm, chỗ ở và không nộp khoản phí nào thiếu biên lai. Hộ chiếu là của con, đừng để ai giữ hộ, nhớ lưu sẵn số điện thoại của cơ quan đại diện Việt Nam nơi đến.',
  },
  {
    level: 'Trung Cát',
    topic: 'Xuất ngoại · Du học',
    title: 'Chờ đèn xanh ở ngã tư',
    verse: ['Đèn còn đỏ đứng chờ thôi', 'Đèn xanh bật sáng ta rồi đi xa'],
    advice: 'Hồ sơ đi nước ngoài có thể chậm hơn dự tính một chút, như đèn đỏ ở ngã tư, chờ rồi sẽ tới lượt. Nộp sớm, theo dõi tình trạng hồ sơ trên kênh chính thức của cơ quan cấp thị thực, thiếu gì bổ sung ngay. Ai hứa “bao đậu” hay đòi thêm tiền để “chạy” hồ sơ thì nên tránh xa, đi đường thẳng tuy chậm mà chắc.',
  },
  {
    level: 'Trung Cát',
    topic: 'Xuất ngoại · Du học',
    title: 'Lá thư học bổng đầu thu',
    verse: ['Thư về học bổng đầu thu', 'Tính tiền cho đủ rồi du học xa'],
    advice: 'Học bổng hay suất học ở nước ngoài có thể đến, nhưng phần tiền bạc cần tính thật kỹ. Lập bảng chi phí cả khóa gồm học phí, chỗ ở, bảo hiểm, ăn uống, cộng thêm một khoản dự phòng, rồi xem gia đình lo được tới đâu. Đừng để cả nhà vay nặng lãi hay cầm cố nhà cửa chỉ vì một tấm bằng, còn nhiều con đường học khác cũng tới đích.',
  },
  {
    level: 'Tiểu Cát',
    topic: 'Xuất ngoại · Du học',
    title: 'Nồi canh chua nơi đất khách',
    verse: ['Xa nhà nấu bát canh chua', 'Nhớ quê gọi mẹ đỡ mùa cô đơn'],
    advice: 'Ở xứ người, những ngày đầu dễ chạnh lòng, chuyện ấy thường tình chứ chẳng phải hạn gì. Lên lịch gọi về nhà vài buổi mỗi tuần, tập nấu vài món quê, tham gia một câu lạc bộ để có thêm bạn mới. Buồn kéo dài hay mất ngủ nhiều ngày thì tìm đến dịch vụ tư vấn tâm lý của trường hoặc nơi làm việc, biết nhờ giúp đỡ là khôn chứ không phải yếu.',
  },

  // ── Định cư ──
  {
    level: 'Thượng Cát',
    topic: 'Định cư',
    title: 'Tấm bản đồ gấp tư',
    verse: ['Phương xa rộng mở vòng tay', 'Hồ sơ minh bạch gặp may đường dài'],
    advice: 'Giấy tờ, bằng cấp đã sẵn sàng thì chuyện định cư năm nay có đường mở cho con. Tìm hiểu diện định cư trên trang chính thức của cơ quan di trú nước sở tại, nhờ luật sư hay đơn vị tư vấn có giấy phép xem giúp, giữ đủ biên lai và bản sao hồ sơ. Đi đường minh bạch thì đến nơi ở được lâu, tối về ngủ cũng ngon.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Định cư',
    title: 'Chào hàng xóm bằng đĩa bánh',
    verse: ['Láng giềng chào hỏi đôi câu', 'Bánh trao tay ấm từ đầu tình thân'],
    advice: 'Về chốn mới, quý nhân của con lại chính là những người hàng xóm. Tuần đầu dọn đến, mang ít bánh trái sang chào, hỏi giờ đổ rác, chỗ gửi xe và quy định chung của khu để khỏi phạm lỗi vô tình. Ở nước ngoài cũng vậy, một lời chào đúng kiểu người bản xứ mở được nhiều cánh cửa hơn con tưởng.',
  },
  {
    level: 'Trung Cát',
    topic: 'Định cư',
    title: 'Ở thử một mùa đông',
    verse: ['Qua chơi trọn một đông hè', 'Đủ mùa đủ nắng hãy nghe lòng mình'],
    advice: 'Chưa vội bán nhà bán xe, vì chuyện định cư của con còn nhiều điều chưa rõ. Nếu có thể, sang ở thử một thời gian, trải qua cả mùa lạnh lẫn mùa nóng, tính kỹ chi phí sinh hoạt, công việc và trường học cho con cái. Duyên đến thì đi cho trọn, chưa đến thì ở lại cũng là phúc, tùy duyên mà lòng không vướng.',
  },
  {
    level: 'Trung Cát',
    topic: 'Định cư',
    title: 'Chuyến tàu đêm vào Nam',
    verse: ['Tàu đêm xuôi chuyến vào Nam', 'Nơi ăn chốn ở việc làm lo xong'],
    advice: 'Chuyển hẳn đến một thành phố khác để lập nghiệp, dù vào Nam hay ra Bắc, năm nay ở mức khá nếu con đi có kế hoạch. Tìm được việc rồi hẵng chuyển, thuê nhà ngắn hạn vài tháng đầu, làm thủ tục đăng ký cư trú, đổi nơi khám chữa bệnh ban đầu của thẻ bảo hiểm y tế và lo hồ sơ trường lớp cho con cái. Đất mới quen dần theo từng mùa, đừng vội so với quê cũ mà buồn.',
  },
  {
    level: 'Tiểu Cát',
    topic: 'Định cư',
    title: 'Câu hát ru tiếng Việt',
    verse: ['Xa quê nhớ tiếng ầu ơ', 'Dạy con tiếng Việt câu thơ ông bà'],
    advice: 'Định cư nơi xa rồi, vận con ổn dần từng chút, chỉ đừng để sợi dây với quê nhà mỏng đi. Giữ thói quen nói tiếng Việt trong nhà, cùng con cháu nấu món quê ngày Tết, vài năm thu xếp về thăm họ hàng một lần. Gốc có vững thì cành mới vươn xa mà chẳng lạc.',
  },
  {
    level: 'Trung Bình',
    topic: 'Định cư',
    title: 'Lối tắt qua bãi lầy',
    verse: ['Lối ngang qua bãi bùn lầy', 'Hứa nhanh hứa chắc mắc dây lụy phiền'],
    advice: 'Quẻ nhắc con cẩn thận với những lời mời định cư “nhanh, chắc, trọn gói”, nhất là khi phải trả trước một khoản lớn. Không làm giấy tờ giả, không kết hôn giả, không đi theo đường dây trái phép, vì cái giá phải trả có khi là cả tương lai lẫn sự an toàn của mình. Mọi thông tin cứ đối chiếu với trang chính thức của cơ quan di trú hay đại sứ quán, chậm mà sạch vẫn hơn.',
  },

  // ── Chuyển nhà · Xây nhà ──
  {
    level: 'Đại Cát',
    topic: 'Chuyển nhà · Xây nhà',
    title: 'Chậu cúc vàng trước hiên',
    verse: ['Cúc vàng nở ở hiên nhà', 'Cửa vui đón bạn gần xa đến mừng'],
    advice: 'Vận nhà cửa năm nay rất thuận, dọn về chỗ ở mới dễ gặp may, việc làm ăn cũng theo đó mà khởi sắc. Muốn làm lễ nhập trạch cho ấm cúng thì giữ đơn sơ, quý nhất là cả nhà cùng có mặt và mời hàng xóm sang chung vui. Trước ngày dọn vào, nhờ thợ kiểm tra lại điện, nước, khóa cửa và sắm sẵn một bình chữa cháy nhỏ cho gian bếp.',
  },
  {
    level: 'Thượng Cát',
    topic: 'Chuyển nhà · Xây nhà',
    title: 'Lịch treo tường khoanh đỏ',
    verse: ['Lịch treo khoanh một ngày lành', 'Trời trong nắng đẹp dọn nhanh nhẹ nhàng'],
    advice: 'Muốn xem ngày dọn nhà cho an lòng thì cứ hỏi người am hiểu, rồi trong mấy ngày đẹp ấy chọn hôm cả nhà cùng rảnh và trời không mưa bão. Thuê đơn vị vận chuyển có hợp đồng, đóng thùng ghi tên từng phòng, giấy tờ quý và tư trang thì mang theo người. Dọn xong nhớ cập nhật địa chỉ mới với ngân hàng, nơi làm việc và trên các giấy tờ cần thiết.',
  },
  {
    level: 'Trung Cát',
    topic: 'Chuyển nhà · Xây nhà',
    title: 'Chiếc áo cũ trao người',
    verse: ['Đồ thừa trao lại người cần', 'Nhà thông lòng nhẹ được phần an nhiên'],
    advice: 'Dọn nhà cũng là dịp dọn lòng, tập buông bớt những thứ mình ôm giữ lâu nay. Món nào cả năm không dùng tới thì tặng người cần, quần áo còn tốt gửi điểm quyên góp, đồ hỏng thì phân loại rồi bỏ đúng chỗ. Nhà bớt đồ thì thêm khoảng thở, lòng biết đủ thì ở đâu cũng thấy rộng.',
  },
  {
    level: 'Trung Cát',
    topic: 'Chuyển nhà · Xây nhà',
    title: 'Nhát cuốc đầu tiên',
    verse: ['Cuốc đầu chưa bổ xuống nền', 'Chốt xong bản vẽ cho bền về sau'],
    advice: 'Khởi công năm nay ở mức thuận, nhưng muốn nhà xong đúng hẹn thì phải chốt bản vẽ trước nhát cuốc đầu tiên. Mỗi lần muốn đổi một chi tiết, hãy ghi rõ bằng văn bản với nhà thầu kèm chi phí phát sinh, cả nhà bàn một lần cho xong thay vì mỗi người sửa một ý. Nhà đổi ý giữa chừng thì tiền chảy như nước, giữ ý từ đầu là giữ được túi tiền.',
  },
  {
    level: 'Tiểu Cát',
    topic: 'Chuyển nhà · Xây nhà',
    title: 'Ba gian nhà nhỏ đủ ấm',
    verse: ['Nhà to nợ lớn chẳng vui', 'Nhà vừa túi bạc ngọt bùi bên nhau'],
    advice: 'Nhà đẹp nhất là căn nhà đã trả xong nợ mà trong đó vẫn còn tiếng cười. Xây vừa với túi tiền hiện có, khoản vay nếu có thì giữ ở mức trả góp hằng tháng không làm cả nhà mất ngủ, chừa sẵn chỗ để sau này nới thêm phòng. Biết đủ là giàu, nhà nhỏ mà thong thả vẫn hơn nhà lớn mà ngày nào cũng lo.',
  },
  {
    level: 'Trung Bình',
    topic: 'Chuyển nhà · Xây nhà',
    title: 'Thùng sách nặng hơn người tưởng',
    verse: ['Dọn nhà đừng cố khuân liều', 'Lưng đau mấy bữa tốn nhiều hơn công'],
    advice: 'Chuyện nhỏ mà hay gặp: ngày dọn nhà dễ mệt, dễ cáu và dễ đau lưng. Đồ nặng thì thuê người có dụng cụ, nâng đúng tư thế, để trẻ nhỏ và người già sang chỗ mới sau khi đã dọn xong, cả nhà nhường nhau một câu cho êm. Dọn chậm vài hôm cũng được, đừng để vừa vào nhà mới đã phải đi khám lưng.',
  },
];
