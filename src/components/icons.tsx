import {
  Apple,
  Baby,
  Backpack,
  Bed,
  Bike,
  BookOpen,
  CakeSlice,
  Camera,
  Car,
  Cat,
  Coffee,
  CookingPot,
  Dog,
  Drill,
  Droplets,
  Dumbbell,
  Fish,
  Flower2,
  Footprints,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  Glasses,
  GraduationCap,
  Hammer,
  Headphones,
  HeartPulse,
  House,
  Lamp,
  Laptop,
  Luggage,
  Map as MapIcon,
  Milk,
  MonitorSmartphone,
  PawPrint,
  PenLine,
  Pill,
  Plane,
  Puzzle,
  Refrigerator,
  Shirt,
  ShoppingBag,
  Shovel,
  Smartphone,
  Sofa,
  Sparkles,
  Speaker,
  SprayCan,
  Sprout,
  Tablet,
  Tent,
  Tv,
  Utensils,
  WashingMachine,
  Watch,
  Wind,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { IconKey } from "@/types";

export const ICON_GROUPS = [
  "Điện tử",
  "Thời trang & phụ kiện",
  "Nhà cửa & gia dụng",
  "Làm đẹp & sức khỏe",
  "Mẹ & bé",
  "Thực phẩm & đồ uống",
  "Thể thao & dã ngoại",
  "Du lịch",
  "Xe cộ",
  "Sách & văn phòng",
  "Thú cưng",
  "Công cụ",
  "Sân vườn",
  "Khác",
] as const;
export type IconGroup = (typeof ICON_GROUPS)[number];

type IconDef = { Icon: LucideIcon; label: string; group: IconGroup; keywords?: string };

/**
 * Bộ biểu tượng danh mục (lucide-react). Mã (khoá) được lưu trong CSDL — KHÔNG đổi hay xoá mã đã có;
 * 18 mã đầu tiên là bộ cũ. Tên tiếng Việt và từ khoá dùng cho ô tìm kiếm trong quản trị.
 */
const ICONS: Record<IconKey, IconDef> = {
  // ── Bộ cũ (giữ nguyên mã) ──
  "monitor-smartphone": { Icon: MonitorSmartphone, label: "Điện tử", group: "Điện tử", keywords: "cong nghe thiet bi" },
  smartphone: { Icon: Smartphone, label: "Điện thoại", group: "Điện tử", keywords: "di dong mobile" },
  laptop: { Icon: Laptop, label: "Laptop", group: "Điện tử", keywords: "may tinh xach tay" },
  shirt: { Icon: Shirt, label: "Áo, quần áo", group: "Thời trang & phụ kiện", keywords: "thoi trang ao quan" },
  "shopping-bag": { Icon: ShoppingBag, label: "Mua sắm chung", group: "Khác", keywords: "tui xach hang hoa" },
  house: { Icon: House, label: "Nhà cửa", group: "Nhà cửa & gia dụng", keywords: "nha o" },
  "cooking-pot": { Icon: CookingPot, label: "Nhà bếp, nồi", group: "Nhà cửa & gia dụng", keywords: "bep noi chao nau an" },
  wind: { Icon: Wind, label: "Quạt, điều hòa", group: "Nhà cửa & gia dụng", keywords: "quat dieu hoa may lanh lam mat" },
  sofa: { Icon: Sofa, label: "Nội thất", group: "Nhà cửa & gia dụng", keywords: "ghe ban noi that" },
  lamp: { Icon: Lamp, label: "Đèn", group: "Nhà cửa & gia dụng", keywords: "den chieu sang" },
  sparkles: { Icon: Sparkles, label: "Làm đẹp", group: "Làm đẹp & sức khỏe", keywords: "my pham trang diem" },
  droplets: { Icon: Droplets, label: "Chăm sóc da", group: "Làm đẹp & sức khỏe", keywords: "duong da serum nuoc" },
  baby: { Icon: Baby, label: "Mẹ & bé", group: "Mẹ & bé", keywords: "em be tre so sinh" },
  puzzle: { Icon: Puzzle, label: "Đồ chơi", group: "Mẹ & bé", keywords: "do choi tre em xep hinh" },
  car: { Icon: Car, label: "Ô tô", group: "Xe cộ", keywords: "xe hoi oto phu kien xe" },
  dumbbell: { Icon: Dumbbell, label: "Thể thao, gym", group: "Thể thao & dã ngoại", keywords: "the duc ta tap luyen" },
  luggage: { Icon: Luggage, label: "Vali", group: "Du lịch", keywords: "hanh ly va li" },
  backpack: { Icon: Backpack, label: "Ba lô", group: "Thời trang & phụ kiện", keywords: "balo cap tui deo" },
  // ── Điện tử ──
  tablet: { Icon: Tablet, label: "Máy tính bảng", group: "Điện tử", keywords: "ipad tablet" },
  headphones: { Icon: Headphones, label: "Tai nghe", group: "Điện tử", keywords: "am thanh headphone earphone" },
  speaker: { Icon: Speaker, label: "Loa", group: "Điện tử", keywords: "am thanh loa bluetooth" },
  camera: { Icon: Camera, label: "Máy ảnh", group: "Điện tử", keywords: "camera chup anh" },
  watch: { Icon: Watch, label: "Đồng hồ", group: "Điện tử", keywords: "dong ho thong minh smartwatch" },
  tv: { Icon: Tv, label: "Tivi", group: "Điện tử", keywords: "tv man hinh" },
  gamepad: { Icon: Gamepad2, label: "Máy chơi game", group: "Điện tử", keywords: "game tay cam choi game" },
  // ── Thời trang & phụ kiện ──
  footprints: { Icon: Footprints, label: "Giày dép", group: "Thời trang & phụ kiện", keywords: "giay dep sandal" },
  glasses: { Icon: Glasses, label: "Kính mắt", group: "Thời trang & phụ kiện", keywords: "kinh mat kinh ram" },
  gem: { Icon: Gem, label: "Trang sức", group: "Thời trang & phụ kiện", keywords: "nhan day chuyen bong tai" },
  // ── Nhà cửa & gia dụng ──
  refrigerator: { Icon: Refrigerator, label: "Tủ lạnh", group: "Nhà cửa & gia dụng", keywords: "tu lanh dien lanh" },
  "washing-machine": { Icon: WashingMachine, label: "Máy giặt", group: "Nhà cửa & gia dụng", keywords: "giat say" },
  bed: { Icon: Bed, label: "Phòng ngủ", group: "Nhà cửa & gia dụng", keywords: "giuong chan ga goi nem" },
  // ── Làm đẹp & sức khỏe ──
  "heart-pulse": { Icon: HeartPulse, label: "Sức khỏe", group: "Làm đẹp & sức khỏe", keywords: "y te suc khoe" },
  pill: { Icon: Pill, label: "Thực phẩm chức năng", group: "Làm đẹp & sức khỏe", keywords: "thuoc vitamin bo sung" },
  "spray-can": { Icon: SprayCan, label: "Nước hoa, xịt", group: "Làm đẹp & sức khỏe", keywords: "nuoc hoa xit khu mui" },
  // ── Mẹ & bé ──
  milk: { Icon: Milk, label: "Sữa", group: "Mẹ & bé", keywords: "sua bot sua tuoi" },
  // ── Thực phẩm & đồ uống ──
  apple: { Icon: Apple, label: "Trái cây, thực phẩm", group: "Thực phẩm & đồ uống", keywords: "hoa qua do an tuoi" },
  coffee: { Icon: Coffee, label: "Cà phê, trà", group: "Thực phẩm & đồ uống", keywords: "ca phe tra do uong nong" },
  utensils: { Icon: Utensils, label: "Ăn uống", group: "Thực phẩm & đồ uống", keywords: "do an mon an thuc pham" },
  wine: { Icon: Wine, label: "Đồ uống", group: "Thực phẩm & đồ uống", keywords: "ruou bia nuoc giai khat" },
  cake: { Icon: CakeSlice, label: "Bánh kẹo", group: "Thực phẩm & đồ uống", keywords: "banh keo an vat" },
  // ── Thể thao & dã ngoại ──
  bike: { Icon: Bike, label: "Xe đạp", group: "Thể thao & dã ngoại", keywords: "xe dap dap xe" },
  tent: { Icon: Tent, label: "Cắm trại, dã ngoại", group: "Thể thao & dã ngoại", keywords: "cam trai leu da ngoai" },
  // ── Du lịch ──
  plane: { Icon: Plane, label: "Du lịch, bay", group: "Du lịch", keywords: "may bay chuyen di" },
  map: { Icon: MapIcon, label: "Bản đồ, hành trình", group: "Du lịch", keywords: "ban do dinh vi" },
  // ── Xe cộ ──
  fuel: { Icon: Fuel, label: "Xe máy, nhiên liệu", group: "Xe cộ", keywords: "xe may xang dau nhot" },
  // ── Sách & văn phòng ──
  "book-open": { Icon: BookOpen, label: "Sách", group: "Sách & văn phòng", keywords: "sach truyen doc" },
  pen: { Icon: PenLine, label: "Văn phòng phẩm", group: "Sách & văn phòng", keywords: "but van phong pham" },
  "graduation-cap": { Icon: GraduationCap, label: "Học tập", group: "Sách & văn phòng", keywords: "hoc tap truong hoc giao duc" },
  // ── Thú cưng ──
  "paw-print": { Icon: PawPrint, label: "Thú cưng", group: "Thú cưng", keywords: "thu cung pet" },
  dog: { Icon: Dog, label: "Chó", group: "Thú cưng", keywords: "cho cun" },
  cat: { Icon: Cat, label: "Mèo", group: "Thú cưng", keywords: "meo" },
  fish: { Icon: Fish, label: "Cá cảnh", group: "Thú cưng", keywords: "ca canh be ca" },
  // ── Công cụ ──
  wrench: { Icon: Wrench, label: "Dụng cụ sửa chữa", group: "Công cụ", keywords: "co le sua chua" },
  hammer: { Icon: Hammer, label: "Dụng cụ cầm tay", group: "Công cụ", keywords: "bua dung cu" },
  drill: { Icon: Drill, label: "Máy khoan", group: "Công cụ", keywords: "khoan dien may cong cu" },
  // ── Sân vườn ──
  flower: { Icon: Flower2, label: "Hoa", group: "Sân vườn", keywords: "hoa cay canh" },
  sprout: { Icon: Sprout, label: "Cây trồng", group: "Sân vườn", keywords: "cay giong hat giong trong cay" },
  shovel: { Icon: Shovel, label: "Làm vườn", group: "Sân vườn", keywords: "xeng dung cu lam vuon" },
  // ── Khác ──
  gift: { Icon: Gift, label: "Quà tặng", group: "Khác", keywords: "qua tang qua" },
};

/** Danh sách mã biểu tượng hợp lệ (kiểm tra ở máy chủ khi lưu danh mục). */
export const ICON_KEYS = Object.keys(ICONS) as IconKey[];

export type IconOption = { key: IconKey; label: string; group: IconGroup; keywords: string };
/** Cho bộ chọn biểu tượng trong quản trị: theo thứ tự nhóm. */
export const ICON_OPTIONS: IconOption[] = ICON_GROUPS.flatMap((g) =>
  ICON_KEYS.filter((k) => ICONS[k].group === g).map((k) => ({ key: k, label: ICONS[k].label, group: g, keywords: ICONS[k].keywords ?? "" })),
);

export const iconLabel = (key: string): string | null => (key in ICONS ? ICONS[key as IconKey].label : null);

export function CategoryIcon({
  icon,
  className,
  strokeWidth = 1.75,
}: {
  icon: IconKey;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = ICONS[icon]?.Icon ?? ShoppingBag; // Dự phòng nếu CSDL chứa tên biểu tượng lạ.
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}
