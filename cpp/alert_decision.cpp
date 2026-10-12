// Demonstration decision component. The thresholds are illustrative test rules, not seismology.
// FINDING CLL-010: main() previously had cyclomatic complexity 19 (lizard threshold 15).
// Validation and decision logic are now separate functions; outputs are byte-for-byte unchanged
// (verified by the assurance evidence hash and the C++/JavaScript parity tests).
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>

namespace {

struct Inputs {
  double magnitude;
  double quality;
  double age_ms;
  double latitude;
  double longitude;
  double depth_km;
};

struct Decision {
  bool candidate;
  std::string_view reason;
  double score;
};

constexpr double kMaxAgeMs = 3'600'000.0;
constexpr double kFreshnessWindowMs = 120'000.0;
constexpr double kMinQuality = 0.65;
constexpr double kMinMagnitude = 4.5;
constexpr double kMinScore = 3.2;

double parse_number(const std::string& value, std::string_view name) {
  try {
    std::size_t consumed = 0;
    const double parsed = std::stod(value, &consumed);
    if (consumed != value.size() || !std::isfinite(parsed)) {
      throw std::invalid_argument("not finite");
    }
    return parsed;
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string(name) + " must be a finite number");
  }
}

bool within(double value, double low, double high) { return value >= low && value <= high; }

bool in_range(const Inputs& in) {
  return within(in.magnitude, -2.0, 10.0) && within(in.quality, 0.0, 1.0) &&
         within(in.age_ms, 0.0, kMaxAgeMs) && within(in.latitude, -90.0, 90.0) &&
         within(in.longitude, -180.0, 180.0) && within(in.depth_km, -5.0, 800.0);
}

Decision decide(const Inputs& in) {
  if (!in_range(in)) {
    return {false, "input_out_of_range", 0.0};
  }
  if (in.age_ms > kFreshnessWindowMs) {
    return {false, "stale_event", 0.0};
  }
  if (in.quality < kMinQuality) {
    return {false, "insufficient_quality", in.magnitude * in.quality};
  }
  const double freshness = std::max(0.0, 1.0 - (in.age_ms / kFreshnessWindowMs));
  const double score = in.magnitude * in.quality * freshness;
  const bool candidate = in.magnitude >= kMinMagnitude && score >= kMinScore;
  return {candidate, candidate ? "test_threshold_met" : "below_test_threshold", score};
}

void print_result(const Decision& decision) {
  std::cout << std::boolalpha << R"({"candidate":)" << decision.candidate << R"(,"reason":")"
            << decision.reason << R"(","score":)" << std::fixed << std::setprecision(3)
            << decision.score << "}\n";
}

}  // namespace

int main(int argc, char* argv[]) {
  if (argc != 7) {
    std::cerr << "usage: alert_decision magnitude quality age_ms latitude longitude depth_km\n";
    return 64;
  }
  try {
    const std::string args[] = {argv[1], argv[2], argv[3], argv[4], argv[5], argv[6]};
    const Inputs inputs{
        parse_number(args[0], "magnitude"), parse_number(args[1], "quality"),
        parse_number(args[2], "age_ms"),    parse_number(args[3], "latitude"),
        parse_number(args[4], "longitude"), parse_number(args[5], "depth_km"),
    };
    print_result(decide(inputs));
    return 0;
  } catch (const std::invalid_argument& error) {
    std::cerr << error.what() << "\n";
    return 65;
  }
}
