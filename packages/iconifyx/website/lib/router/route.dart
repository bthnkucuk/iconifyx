import 'package:flutter/widgets.dart';
import 'package:zenrouter/zenrouter.dart';

import 'coordinator.dart';

abstract class AppRoute extends RouteTarget with RouteUnique {
  @override
  Widget build(covariant AppCoordinator coordinator, BuildContext context);
}
